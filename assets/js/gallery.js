const PROJECTS_JSON_PATH = "assets/data/projects.json";

function getGroupFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return (params.get("group") || "").trim().toLowerCase();
}

function setFooterYear() {
    const yearEl = document.getElementById("year");
    if (yearEl) {
        yearEl.textContent = new Date().getFullYear();
    }
}

function escapeHTML(text) {
    const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
    };
    return String(text || "").replace(/[&<>"']/g, (m) => map[m]);
}

function renderEmpty(message) {
    const title = document.getElementById("galleryTitle");
    const subtitle = document.getElementById("gallerySubtitle");
    const grid = document.getElementById("galleryGrid");

    if (title) {
        title.textContent = "Group not found";
    }
    if (subtitle) {
        subtitle.textContent = message;
    }
    if (grid) {
        grid.innerHTML = `<p style="grid-column: 1/-1; color: #888;">${escapeHTML(message)}</p>`;
    }
}

function createImageCard(imagePath, titleText, index) {
    const card = document.createElement("article");
    card.className = "project-card";

    card.innerHTML = `
        <a href="${escapeHTML(imagePath)}" target="_blank" rel="noopener noreferrer" class="group-card-link" aria-label="Open image ${index + 1}">
            <div class="project-media">
                <img src="${escapeHTML(imagePath)}" alt="${escapeHTML(titleText)} image ${index + 1}" loading="lazy" />
            </div>
        </a>
    `;

    return card;
}

function extractImages(entry) {
    if (Array.isArray(entry.gallery_images) && entry.gallery_images.length) {
        return entry.gallery_images;
    }
    if (entry.image) {
        return [entry.image];
    }
    return [];
}

async function initGalleryPage() {
    const requestedGroup = getGroupFromUrl();
    if (!requestedGroup) {
        renderEmpty("No group selected. Open a folder from the homepage.");
        return;
    }

    try {
        const response = await fetch(PROJECTS_JSON_PATH);
        if (!response.ok) {
            renderEmpty("Could not load gallery data.");
            return;
        }

        const projects = await response.json();
        const entry = Array.isArray(projects)
            ? projects.find((project) => {
                const source = String(project.source || "").toLowerCase();
                const assetKey = String(project.asset_key || "").toLowerCase();
                return source === "auto-content" && assetKey === `content/${requestedGroup}`;
            })
            : null;

        if (!entry) {
            renderEmpty(`Group \"${requestedGroup}\" was not found in projects.json.`);
            return;
        }

        const images = extractImages(entry);
        const title = document.getElementById("galleryTitle");
        const subtitle = document.getElementById("gallerySubtitle");
        const grid = document.getElementById("galleryGrid");

        if (title) {
            title.textContent = entry.title || requestedGroup;
        }
        if (subtitle) {
            subtitle.textContent = `${images.length} image${images.length === 1 ? "" : "s"} in this folder.`;
        }

        if (!images.length) {
            renderEmpty("This folder has no images yet.");
            return;
        }

        grid.innerHTML = "";
        images.forEach((imagePath, index) => {
            grid.appendChild(createImageCard(imagePath, entry.title || requestedGroup, index));
        });
    } catch (error) {
        console.error("Gallery load error:", error);
        renderEmpty("Unexpected error while loading this gallery.");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    setFooterYear();
    initGalleryPage();
});
