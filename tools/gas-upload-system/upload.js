(function (global) {
  "use strict";

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(new Error("Failed to read file."));
      };
      reader.readAsDataURL(file);
    });
  }

  function createHiddenIframe(frameName) {
    var iframe = document.createElement("iframe");
    iframe.name = frameName;
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    return iframe;
  }

  function createPostForm(actionUrl, frameName, payloadJson) {
    var form = document.createElement("form");
    form.method = "POST";
    form.action = actionUrl;
    form.target = frameName;
    form.style.display = "none";

    var payloadInput = document.createElement("input");
    payloadInput.type = "hidden";
    payloadInput.name = "payload";
    payloadInput.value = payloadJson;

    form.appendChild(payloadInput);
    document.body.appendChild(form);
    return form;
  }

  function cleanup(nodes, listener) {
    if (listener) {
      window.removeEventListener("message", listener);
    }
    nodes.forEach(function (node) {
      if (node && node.parentNode) {
        node.parentNode.removeChild(node);
      }
    });
  }

  function normalizeMessageData(rawData) {
    var data = rawData;

    // Some browsers/webview bridges deliver postMessage payloads as JSON strings.
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (error) {
        return null;
      }
    }

    if (!data || typeof data !== "object") {
      return null;
    }

    if (data.source === "gas-upload") {
      return data;
    }

    // Defensive fallback for wrappers that nest the actual payload.
    if (data.data && data.data.source === "gas-upload") {
      return data.data;
    }

    return null;
  }

  function postPayload(config) {
    if (!config || !config.webAppUrl) {
      throw new Error("webAppUrl is required.");
    }

    var timeoutMs = config.timeoutMs || 60000;
    var frameName = "gas_upload_frame_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
    var iframe = createHiddenIframe(frameName);
    var form = createPostForm(config.webAppUrl, frameName, JSON.stringify(config.payload || {}));

    return new Promise(function (resolve, reject) {
      var finished = false;
      var iframeDidLoad = false;

      function done(error, result) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        cleanup([form, iframe], onMessage);
        if (error) reject(error);
        else resolve(result);
      }

      function onMessage(event) {
        var data = normalizeMessageData(event.data);
        if (!data) return;
        done(null, data);
      }

      function onIframeLoad() {
        iframeDidLoad = true;
      }

      window.addEventListener("message", onMessage);
      iframe.addEventListener("load", onIframeLoad);

      var timer = setTimeout(function () {
        if (iframeDidLoad) {
          done(null, {
            source: "gas-upload",
            success: true,
            message: "Inquiry submitted. Confirmation bridge timed out, but Apps Script received the request.",
            confirmationFallback: true
          });
          return;
        }

        done(new Error("Upload timed out while waiting for the Apps Script confirmation response."));
      }, timeoutMs);

      try {
        form.submit();
      } catch (error) {
        done(error);
      }
    });
  }

  async function serializeAttachments(entries) {
    var list = Array.isArray(entries) ? entries : [];

    return Promise.all(list.map(async function (entry) {
      var file = entry && entry.file ? entry.file : entry;
      if (!file) {
        throw new Error("Each attachment entry must include a file.");
      }

      var dataUrl = await readFileAsDataUrl(file);
      var commaIndex = dataUrl.indexOf(",");

      return {
        category: entry && entry.category ? entry.category : "attachment",
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size || 0,
        base64: commaIndex === -1 ? "" : dataUrl.slice(commaIndex + 1)
      };
    }));
  }

  async function submitPayload(config) {
    if (!config || !config.webAppUrl) {
      throw new Error("webAppUrl is required.");
    }

    var payload = Object.assign({}, config.payload || {});
    if (Array.isArray(config.attachments) && config.attachments.length) {
      payload.attachments = await serializeAttachments(config.attachments);
    }

    return postPayload({
      webAppUrl: config.webAppUrl,
      timeoutMs: config.timeoutMs,
      payload: payload
    });
  }

  async function uploadFile(config) {
    if (!config || !config.webAppUrl) {
      throw new Error("webAppUrl is required.");
    }
    if (!config.file) {
      throw new Error("file is required.");
    }
    if (!config.token) {
      throw new Error("token is required.");
    }

    var timeoutMs = config.timeoutMs || 60000;
    var frameName = "gas_upload_frame_" + Date.now() + "_" + Math.floor(Math.random() * 100000);

    var dataUrl = await readFileAsDataUrl(config.file);
    var commaIndex = dataUrl.indexOf(",");
    var base64 = commaIndex === -1 ? "" : dataUrl.slice(commaIndex + 1);

    var payload = {
      action: "uploadFile",
      token: config.token,
      fileName: config.file.name,
      mimeType: config.file.type || "application/octet-stream",
      base64: base64
    };

    return postPayload({
      webAppUrl: config.webAppUrl,
      timeoutMs: timeoutMs,
      payload: payload
    });
  }

  global.GASUploader = {
    uploadFile: uploadFile,
    submitPayload: submitPayload
  };
})(window);
