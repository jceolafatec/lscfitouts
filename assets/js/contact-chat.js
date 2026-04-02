(function () {
    "use strict";

    var CONFIG = {
        formId: "contact-chat-form",
        fileInputId: "contact-chat-files",
        fileListId: "contact-chat-file-list",
        submitButtonId: "contact-chat-submit",
        statusId: "contact-chat-status",
        maxFiles: 4,
        maxSingleFileBytes: 10 * 1024 * 1024,
        maxTotalBytes: 20 * 1024 * 1024
    };

    function $(id) {
        return document.getElementById(id);
    }

    function formatBytes(bytes) {
        if (!bytes) {
            return "0 B";
        }

        var units = ["B", "KB", "MB", "GB"];
        var value = Number(bytes);
        var unitIndex = 0;

        while (value >= 1024 && unitIndex < units.length - 1) {
            value = value / 1024;
            unitIndex += 1;
        }

        return value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1) + " " + units[unitIndex];
    }

    function setStatus(type, message) {
        var status = $(CONFIG.statusId);
        if (!status) {
            return;
        }

        status.className = "contact-chat-status";
        if (type) {
            status.classList.add("is-" + type);
        }
        status.textContent = message || "";
    }

    function renderFileList(files) {
        var list = $(CONFIG.fileListId);
        if (!list) {
            return;
        }

        list.innerHTML = "";

        if (!files.length) {
            var empty = document.createElement("p");
            empty.className = "empty-file-state";
            empty.textContent = "No files selected yet.";
            list.appendChild(empty);
            return;
        }

        files.forEach(function (file) {
            var chip = document.createElement("div");
            chip.className = "file-chip";

            var name = document.createElement("strong");
            name.textContent = file.name;

            var meta = document.createElement("span");
            meta.textContent = formatBytes(file.size || 0);

            chip.appendChild(name);
            chip.appendChild(meta);
            list.appendChild(chip);
        });
    }

    function getSelectedFiles() {
        var fileInput = $(CONFIG.fileInputId);
        return fileInput ? Array.prototype.slice.call(fileInput.files || []) : [];
    }

    function validateFiles(files) {
        var totalBytes = files.reduce(function (sum, file) {
            return sum + Number(file.size || 0);
        }, 0);

        if (files.length > CONFIG.maxFiles) {
            return "Please upload up to " + CONFIG.maxFiles + " files at a time.";
        }

        if (totalBytes > CONFIG.maxTotalBytes) {
            return "The total upload size must stay under " + formatBytes(CONFIG.maxTotalBytes) + ".";
        }

        for (var index = 0; index < files.length; index += 1) {
            if ((files[index].size || 0) > CONFIG.maxSingleFileBytes) {
                return files[index].name + " is larger than " + formatBytes(CONFIG.maxSingleFileBytes) + ".";
            }
        }

        return "";
    }

    function validateForm(fields, files) {
        if (!fields.name) {
            return "Please enter your name.";
        }

        if (!fields.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
            return "Please enter a valid email address.";
        }

        if (!fields.projectType) {
            return "Please select a project type.";
        }

        if (!fields.brief) {
            return "Please describe the project brief.";
        }

        return validateFiles(files);
    }

    function readFormFields(form) {
        var formData = new FormData(form);
        return {
            name: String(formData.get("name") || "").trim(),
            email: String(formData.get("email") || "").trim(),
            phone: String(formData.get("phone") || "").trim(),
            projectType: String(formData.get("projectType") || "").trim(),
            timeline: String(formData.get("timeline") || "").trim(),
            budget: String(formData.get("budget") || "").trim(),
            brief: String(formData.get("brief") || "").trim()
        };
    }

    function getRuntimeConfig() {
        var runtime = window.PYTHA_CONTACT_CHAT_CONFIG || {};
        return {
            webAppUrl: String(runtime.webAppUrl || "").trim(),
            publicToken: String(runtime.publicToken || "").trim()
        };
    }

    function getRuntimeConfigError(runtime) {
        if (!runtime.webAppUrl || !runtime.publicToken) {
            return "Contact chat is not configured yet. Add the Google Apps Script URL and public token first.";
        }

        if (/script\.googleusercontent\.com\/macros\/echo/i.test(runtime.webAppUrl)) {
            return "Use the stable Google Apps Script web app URL ending in /exec, not the temporary googleusercontent redirect URL.";
        }

        if (/\/dev(?:$|\?)/i.test(runtime.webAppUrl)) {
            return "Use the public Google Apps Script /exec deployment URL, not the /dev test URL.";
        }

        return "";
    }

    function setBusyState(button, isBusy) {
        if (!button) {
            return;
        }

        button.disabled = isBusy;
        button.textContent = isBusy ? "Sending..." : "Send Project Brief";
    }

    async function handleSubmit(event) {
        event.preventDefault();

        var form = event.currentTarget;
        var submitButton = $(CONFIG.submitButtonId);
        var runtime = getRuntimeConfig();
        var runtimeError = getRuntimeConfigError(runtime);

        if (runtimeError) {
            setStatus("error", runtimeError);
            return;
        }

        if (!window.GASUploader || typeof window.GASUploader.submitPayload !== "function") {
            setStatus("error", "Upload helper failed to load. Please refresh the page and try again.");
            return;
        }

        var fields = readFormFields(form);
        var files = getSelectedFiles();
        var validationError = validateForm(fields, files);

        if (validationError) {
            setStatus("error", validationError);
            return;
        }

        setBusyState(submitButton, true);
        setStatus("pending", "Sending your message and uploading attachments...");

        try {
            var result = await window.GASUploader.submitPayload({
                webAppUrl: runtime.webAppUrl,
                timeoutMs: 90000,
                payload: {
                    action: "submitInquiry",
                    token: runtime.publicToken,
                    form: fields
                },
                attachments: files.map(function (file) {
                    return {
                        file: file,
                        category: "client-upload"
                    };
                })
            });

            if (!result || !result.success) {
                throw new Error(result && result.message ? result.message : "The submission did not complete.");
            }

            form.reset();
            renderFileList([]);

            if (result.confirmationFallback) {
                setStatus("success", "Project brief submitted. Drive received your inquiry, but browser confirmation was delayed.");
            } else {
                setStatus("success", "Project brief sent. I have your message" + (result.attachmentCount ? " and " + result.attachmentCount + " attachment(s)" : "") + " in my Drive inbox.");
            }
        } catch (error) {
            var message = error && error.message ? error.message : "Something went wrong while sending your message.";

            if (/timed out/i.test(message)) {
                message = "The site did not receive the Apps Script confirmation in time. If the inquiry appears in Drive, redeploy the latest /exec web app version so it posts the success message back to the page.";
            }

            setStatus("error", message);
        } finally {
            setBusyState(submitButton, false);
        }
    }

    function initContactChat() {
        var form = $(CONFIG.formId);
        var fileInput = $(CONFIG.fileInputId);

        if (!form || !fileInput) {
            return;
        }

        renderFileList(getSelectedFiles());
        setStatus("", "Share the project scope here. Attachments are uploaded only when you submit the form.");

        fileInput.addEventListener("change", function () {
            var files = getSelectedFiles();
            renderFileList(files);

            var validationError = validateFiles(files);
            if (validationError) {
                setStatus("error", validationError);
            } else {
                setStatus("", files.length ? "Files ready to send with your project brief." : "Share the project scope here. Attachments are uploaded only when you submit the form.");
            }
        });

        form.addEventListener("submit", handleSubmit);
    }

    document.addEventListener("DOMContentLoaded", initContactChat);
})();