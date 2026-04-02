(function () {
  "use strict";

  var config = window.PYTHA_ADMIN_INBOX_CONFIG || {};
  var state = {
    submissions: [],
    filtered: [],
    activeFolderId: ""
  };

  var searchInput = document.getElementById("search-input");
  var refreshBtn = document.getElementById("refresh-btn");
  var submissionList = document.getElementById("submission-list");
  var sidebarStatus = document.getElementById("sidebar-status");
  var detailTitle = document.getElementById("detail-title");
  var detailSubtitle = document.getElementById("detail-subtitle");
  var metaGrid = document.getElementById("meta-grid");
  var briefText = document.getElementById("brief-text");
  var attachmentList = document.getElementById("attachment-list");
  var responseList = document.getElementById("response-list");
  var responderNameInput = document.getElementById("responder-name");
  var responseMessageInput = document.getElementById("response-message");
  var saveResponseBtn = document.getElementById("save-response-btn");
  var openFolderLink = document.getElementById("open-folder-link");
  var detailStatus = document.getElementById("detail-status");

  responderNameInput.value = config.responderName || "Jeferson";

  function escapeHtml(text) {
    return String(text || "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char];
    });
  }

  function setSidebarStatus(message, stateName) {
    sidebarStatus.textContent = message || "";
    sidebarStatus.className = "status" + (stateName ? " " + stateName : "");
  }

  function setDetailStatus(message, stateName) {
    detailStatus.textContent = message || "";
    detailStatus.className = "status" + (stateName ? " " + stateName : "");
  }

  function getActiveSubmission() {
    return state.submissions.find(function (item) {
      return item.folderId === state.activeFolderId;
    }) || null;
  }

  function applyFilter() {
    var term = String(searchInput.value || "").trim().toLowerCase();
    state.filtered = state.submissions.filter(function (item) {
      if (!term) return true;
      var haystack = [
        item.form && item.form.name,
        item.form && item.form.email,
        item.form && item.form.projectType,
        item.form && item.form.phone,
        item.form && item.form.brief
      ].join(" ").toLowerCase();
      return haystack.indexOf(term) !== -1;
    });

    if (state.activeFolderId && !state.filtered.some(function (item) { return item.folderId === state.activeFolderId; })) {
      state.activeFolderId = state.filtered[0] ? state.filtered[0].folderId : "";
    }

    renderSubmissionList();
    renderDetail();
  }

  function renderSubmissionList() {
    if (!state.filtered.length) {
      submissionList.innerHTML = '<div class="empty">No submissions match the current filter.</div>';
      return;
    }

    submissionList.innerHTML = state.filtered.map(function (item) {
      var activeClass = item.folderId === state.activeFolderId ? " active" : "";
      var count = Array.isArray(item.attachments) ? item.attachments.length : 0;
      return [
        '<button class="submission-card' + activeClass + '" type="button" data-folder-id="' + escapeHtml(item.folderId) + '">',
        '  <strong>' + escapeHtml(item.form.name || item.folderName || item.submissionId) + '</strong>',
        '  <div class="status">' + escapeHtml(item.form.projectType || "") + '</div>',
        '  <div class="status">' + escapeHtml(item.form.email || "") + '</div>',
        '  <div class="status">' + escapeHtml(item.createdAt || "") + ' · ' + count + ' file(s)</div>',
        '</button>'
      ].join("");
    }).join("");
  }

  function renderMetaGrid(submission) {
    var items = [
      ["Name", submission.form.name],
      ["Email", submission.form.email],
      ["Phone", submission.form.phone || "Not provided"],
      ["Project Type", submission.form.projectType],
      ["Timeline", submission.form.timeline || "Not provided"],
      ["Budget", submission.form.budget || "Not provided"],
      ["Created", submission.createdAt],
      ["Submission ID", submission.submissionId]
    ];

    metaGrid.innerHTML = items.map(function (item) {
      return [
        '<div class="meta-item">',
        '  <span>' + escapeHtml(item[0]) + '</span>',
        '  <div>' + escapeHtml(item[1]) + '</div>',
        '</div>'
      ].join("");
    }).join("");
  }

  function renderAttachments(submission) {
    var attachments = Array.isArray(submission.attachments) ? submission.attachments : [];
    if (!attachments.length) {
      attachmentList.innerHTML = '<div class="empty">No attachments for this inquiry.</div>';
      return;
    }

    attachmentList.innerHTML = attachments.map(function (attachment) {
      return [
        '<div class="attachment">',
        '  <strong>' + escapeHtml(attachment.fileName) + '</strong>',
        '  <div class="status">' + escapeHtml(attachment.category) + ' · ' + escapeHtml(attachment.mimeType) + '</div>',
        '  <a href="' + escapeHtml(attachment.fileUrl) + '" target="_blank" rel="noreferrer">Open in Drive</a>',
        '</div>'
      ].join("");
    }).join("");
  }

  function renderResponses(submission) {
    var responses = Array.isArray(submission.responses) ? submission.responses : [];
    if (!responses.length) {
      responseList.innerHTML = '<div class="empty">No responses saved yet.</div>';
      return;
    }

    responseList.innerHTML = responses.slice().reverse().map(function (response) {
      return [
        '<div class="response">',
        '  <strong>' + escapeHtml(response.responderName || "Response") + '</strong>',
        '  <div class="status">' + escapeHtml(response.createdAt || "") + '</div>',
        '  <p>' + escapeHtml(response.message || "") + '</p>',
        '</div>'
      ].join("");
    }).join("");
  }

  function renderDetail() {
    var submission = getActiveSubmission();
    if (!submission) {
      detailTitle.textContent = "Select a submission";
      detailSubtitle.textContent = "Choose a project inquiry from the inbox.";
      metaGrid.innerHTML = '<div class="empty">No submission selected.</div>';
      briefText.className = "empty";
      briefText.textContent = "No submission selected.";
      attachmentList.innerHTML = '<div class="empty">No submission selected.</div>';
      responseList.innerHTML = '<div class="empty">No submission selected.</div>';
      openFolderLink.href = "#";
      return;
    }

    detailTitle.textContent = submission.form.name || submission.folderName;
    detailSubtitle.textContent = submission.form.projectType + " · " + submission.form.email;
    renderMetaGrid(submission);
    briefText.className = "";
    briefText.textContent = submission.form.brief || "No project brief provided.";
    renderAttachments(submission);
    renderResponses(submission);
    openFolderLink.href = submission.folderUrl || "#";
  }

  async function loadSubmissions() {
    if (!config.webAppUrl || !config.adminToken) {
      setSidebarStatus("Set webAppUrl and adminToken in index.html before using the inbox.", "error");
      return;
    }

    if (!window.GASUploader || typeof window.GASUploader.submitPayload !== "function") {
      setSidebarStatus("Uploader helper is missing.", "error");
      return;
    }

    setSidebarStatus("Loading submissions...", "");
    setDetailStatus("", "");

    try {
      var result = await window.GASUploader.submitPayload({
        webAppUrl: config.webAppUrl,
        timeoutMs: 120000,
        payload: {
          action: "listSubmissions",
          adminToken: config.adminToken
        }
      });

      if (!result.success) {
        throw new Error(result.message || "Could not load inbox.");
      }

      state.submissions = Array.isArray(result.submissions) ? result.submissions : [];
      state.activeFolderId = state.submissions[0] ? state.submissions[0].folderId : "";
      setSidebarStatus(result.message || "Inbox loaded.", state.submissions.length ? "success" : "");
      applyFilter();
    } catch (error) {
      setSidebarStatus(error.message || "Could not load inbox.", "error");
    }
  }

  async function saveResponse() {
    var submission = getActiveSubmission();
    if (!submission) {
      setDetailStatus("Select a submission first.", "error");
      return;
    }

    var message = String(responseMessageInput.value || "").trim();
    if (!message) {
      setDetailStatus("Write a response note before saving.", "error");
      return;
    }

    saveResponseBtn.disabled = true;
    setDetailStatus("Saving response...", "");

    try {
      var result = await window.GASUploader.submitPayload({
        webAppUrl: config.webAppUrl,
        timeoutMs: 120000,
        payload: {
          action: "saveResponse",
          adminToken: config.adminToken,
          folderId: submission.folderId,
          responderName: responderNameInput.value || config.responderName || "Jeferson",
          message: message
        }
      });

      if (!result.success) {
        throw new Error(result.message || "Could not save response.");
      }

      responseMessageInput.value = "";
      setDetailStatus("Response saved to Drive.", "success");
      await loadSubmissions();
      state.activeFolderId = submission.folderId;
      applyFilter();
    } catch (error) {
      setDetailStatus(error.message || "Could not save response.", "error");
    } finally {
      saveResponseBtn.disabled = false;
    }
  }

  submissionList.addEventListener("click", function (event) {
    var button = event.target.closest("[data-folder-id]");
    if (!button) return;
    state.activeFolderId = button.getAttribute("data-folder-id") || "";
    renderSubmissionList();
    renderDetail();
    setDetailStatus("", "");
  });

  searchInput.addEventListener("input", applyFilter);
  refreshBtn.addEventListener("click", loadSubmissions);
  saveResponseBtn.addEventListener("click", saveResponse);

  loadSubmissions();
})();