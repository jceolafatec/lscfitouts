#!/usr/bin/env python3
"""
GUI Project Manager for your portfolio (Tkinter + XML).

Features:
- Load projects from projects.xml
- Display project list
- Add / edit / delete projects
- Save changes to XML
- Generate HTML snippet for project cards (projects_snippet.html)

You can later turn this into an .exe using PyInstaller:
    pyinstaller --onefile project_manager_gui.py
"""

import os
import xml.etree.ElementTree as ET
import tkinter as tk
from tkinter import ttk, messagebox, filedialog

# -------------------------------------------------------------------
# Paths / Constants
# -------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
XML_FILE = os.path.join(BASE_DIR, "projects.xml")
SNIPPET_FILE = os.path.join(BASE_DIR, "projects_snippet.html")


# -------------------------------------------------------------------
# XML Handling
# -------------------------------------------------------------------

def ensure_xml_exists():
    """Create an empty projects.xml if it doesn't exist."""
    if not os.path.exists(XML_FILE):
        root = ET.Element("projects")
        tree = ET.ElementTree(root)
        tree.write(XML_FILE, encoding="utf-8", xml_declaration=True)


def load_projects():
    """Return (tree, root, list_of_projects)."""
    ensure_xml_exists()
    tree = ET.parse(XML_FILE)
    root = tree.getroot()

    projects = []
    for p in root.findall("project"):
        projects.append({
            "id": p.get("id", ""),
            "title": (p.findtext("title") or "").strip(),
            "meta": (p.findtext("meta") or "").strip(),
            "description": (p.findtext("description") or "").strip(),
            "image": (p.findtext("image") or "").strip(),
            "element": p,
        })
    return tree, root, projects


def get_next_id(root):
    """Compute the next numeric id for a new project."""
    ids = []
    for p in root.findall("project"):
        pid = p.get("id")
        if pid and pid.isdigit():
            ids.append(int(pid))
    return str((max(ids) if ids else 0) + 1)


def save_projects(tree):
    """Write XML file."""
    tree.write(XML_FILE, encoding="utf-8", xml_declaration=True)


def generate_html_snippet(root):
    """Generate the HTML snippet file from XML projects."""
    cards = []
    for project in root.findall("project"):
        title = (project.findtext("title") or "").strip()
        meta = (project.findtext("meta") or "").strip()
        description = (project.findtext("description") or "").strip()
        image = (project.findtext("image") or "").strip()

        if image:
            media_html = f'''<div class="project-media">
    <img src="{image}" alt="{title}">
</div>'''
        else:
            media_html = '''<div class="project-media placeholder">
    <span class="project-media-label">Image</span>
</div>'''

        card_html = f"""<article class="project-card">
    {media_html}
    <div class="project-body">
        <h3 class="project-title">{title}</h3>
        <p class="project-meta">{meta}</p>
        <p class="project-description">
            {description}
        </p>
    </div>
</article>"""

        cards.append(card_html)

    content = "\n\n".join(cards)
    with open(SNIPPET_FILE, "w", encoding="utf-8") as f:
        f.write(content)


# -------------------------------------------------------------------
# Tkinter GUI
# -------------------------------------------------------------------

class ProjectManagerGUI(tk.Tk):
    def __init__(self):
        super().__init__()

        self.title("Portfolio Project Manager")
        self.minsize(800, 500)

        # Load XML / projects
        self.tree, self.root, self.projects = load_projects()
        self.current_index = None  # index in self.projects

        self._build_ui()
        self._populate_project_list()

    # -----------------------------
    # UI Layout
    # -----------------------------
    def _build_ui(self):
        # Use a main frame for padding
        main = ttk.Frame(self, padding=10)
        main.pack(fill="both", expand=True)

        # Left: list of projects
        left_frame = ttk.Frame(main)
        left_frame.pack(side="left", fill="y", padx=(0, 10))

        ttk.Label(left_frame, text="Projects", font=("Segoe UI", 10, "bold")).pack(
            anchor="w", pady=(0, 5)
        )

        self.project_listbox = tk.Listbox(
            left_frame,
            height=20,
            exportselection=False
        )
        self.project_listbox.pack(fill="y", expand=True)

        self.project_listbox.bind("<<ListboxSelect>>", self._on_project_select)

        btn_frame = ttk.Frame(left_frame)
        btn_frame.pack(fill="x", pady=(8, 0))

        ttk.Button(btn_frame, text="New", command=self.new_project).pack(
            side="left", expand=True, fill="x", padx=(0, 4)
        )
        ttk.Button(btn_frame, text="Delete", command=self.delete_project).pack(
            side="left", expand=True, fill="x", padx=(4, 0)
        )

        # Right: detail form
        right_frame = ttk.Frame(main)
        right_frame.pack(side="right", fill="both", expand=True)

        # -- Title
        ttk.Label(right_frame, text="Title").grid(row=0, column=0, sticky="w")
        self.entry_title = ttk.Entry(right_frame)
        self.entry_title.grid(row=1, column=0, sticky="ew", pady=(0, 8))

        # -- Meta
        ttk.Label(right_frame, text="Meta (e.g. 'UI Design · 2025')").grid(
            row=2, column=0, sticky="w"
        )
        self.entry_meta = ttk.Entry(right_frame)
        self.entry_meta.grid(row=3, column=0, sticky="ew", pady=(0, 8))

        # -- Description
        ttk.Label(right_frame, text="Description").grid(row=4, column=0, sticky="w")
        self.text_description = tk.Text(right_frame, height=6, wrap="word")
        self.text_description.grid(row=5, column=0, sticky="nsew", pady=(0, 8))

        # -- Image
        img_frame = ttk.Frame(right_frame)
        img_frame.grid(row=6, column=0, sticky="ew", pady=(0, 8))
        img_frame.columnconfigure(0, weight=1)

        ttk.Label(img_frame, text="Image path (optional)").grid(
            row=0, column=0, sticky="w"
        )
        self.entry_image = ttk.Entry(img_frame)
        self.entry_image.grid(row=1, column=0, sticky="ew", pady=(0, 4))
        ttk.Button(img_frame, text="Browse...", command=self.browse_image).grid(
            row=1, column=1, sticky="ew", padx=(4, 0)
        )

        # Bottom buttons (Save + Generate HTML)
        bottom_frame = ttk.Frame(right_frame)
        bottom_frame.grid(row=7, column=0, sticky="ew", pady=(10, 0))

        ttk.Button(bottom_frame, text="Save Project", command=self.save_project).pack(
            side="left", expand=True, fill="x", padx=(0, 4)
        )
        ttk.Button(
            bottom_frame,
            text="Generate HTML Snippet",
            command=self.generate_snippet_and_notify,
        ).pack(side="left", expand=True, fill="x", padx=(4, 0))

        # Configure right frame grid
        right_frame.columnconfigure(0, weight=1)
        right_frame.rowconfigure(5, weight=1)  # make description expand

    # -----------------------------
    # Helper: Populate list
    # -----------------------------
    def _populate_project_list(self):
        self.project_listbox.delete(0, tk.END)
        for p in self.projects:
            label = p["title"] or "(Untitled project)"
            if p["meta"]:
                label += f" – {p['meta']}"
            self.project_listbox.insert(tk.END, label)

        # Select first project if exists
        if self.projects:
            self.project_listbox.select_set(0)
            self._load_project_into_form(0)

    # -----------------------------
    # Event: Select project
    # -----------------------------
    def _on_project_select(self, event):
        selection = self.project_listbox.curselection()
        if not selection:
            return
        index = selection[0]
        self._load_project_into_form(index)

    def _load_project_into_form(self, index):
        """Load project fields into form."""
        if index < 0 or index >= len(self.projects):
            return
        self.current_index = index
        p = self.projects[index]

        # Clear form
        self.entry_title.delete(0, tk.END)
        self.entry_meta.delete(0, tk.END)
        self.text_description.delete("1.0", tk.END)
        self.entry_image.delete(0, tk.END)

        # Fill
        self.entry_title.insert(0, p["title"])
        self.entry_meta.insert(0, p["meta"])
        self.text_description.insert("1.0", p["description"])
        self.entry_image.insert(0, p["image"])

    # -----------------------------
    # New / Delete
    # -----------------------------
    def new_project(self):
        """Create a new in-memory project and select it."""
        # Ensure form is clean
        self.current_index = None
        self.entry_title.delete(0, tk.END)
        self.entry_meta.delete(0, tk.END)
        self.text_description.delete("1.0", tk.END)
        self.entry_image.delete(0, tk.END)
        self.project_listbox.selection_clear(0, tk.END)

        messagebox.showinfo(
            "New project",
            "Fill in the fields, then click 'Save Project' to add it.",
        )

    def delete_project(self):
        """Delete selected project."""
        if self.current_index is None or not self.projects:
            messagebox.showwarning("Delete", "No project selected.")
            return

        p = self.projects[self.current_index]
        title = p["title"] or "(Untitled project)"

        if not messagebox.askyesno(
            "Delete project", f"Delete '{title}'?\nThis cannot be undone."
        ):
            return

        # Remove from XML root
        self.root.remove(p["element"])
        save_projects(self.tree)

        # Reload data
        self.tree, self.root, self.projects = load_projects()
        self.current_index = None
        self._populate_project_list()

    # -----------------------------
    # Save / Update
    # -----------------------------
    def save_project(self):
        """Save current form as new or update existing."""
        title = self.entry_title.get().strip()
        meta = self.entry_meta.get().strip()
        description = self.text_description.get("1.0", tk.END).strip()
        image = self.entry_image.get().strip()

        if not title:
            messagebox.showwarning("Validation", "Title is required.")
            return

        if self.current_index is None:
            # Create new project in XML
            pid = get_next_id(self.root)
            project_el = ET.SubElement(self.root, "project", id=pid)
            ET.SubElement(project_el, "title").text = title
            ET.SubElement(project_el, "meta").text = meta
            ET.SubElement(project_el, "description").text = description
            ET.SubElement(project_el, "image").text = image
        else:
            # Update existing
            p = self.projects[self.current_index]
            project_el = p["element"]

            # Update sub-elements
            for tag, value in [
                ("title", title),
                ("meta", meta),
                ("description", description),
                ("image", image),
            ]:
                node = project_el.find(tag)
                if node is None:
                    node = ET.SubElement(project_el, tag)
                node.text = value

        # Save XML
        save_projects(self.tree)

        # Reload in-memory list and refresh UI
        self.tree, self.root, self.projects = load_projects()
        self._populate_project_list()

        messagebox.showinfo("Saved", "Project saved successfully.")

    # -----------------------------
    # Browse image path
    # -----------------------------
    def browse_image(self):
        """Let user pick an image; store relative path if inside repo."""
        filetypes = [
            ("Images", "*.png *.jpg *.jpeg *.gif *.webp *.bmp"),
            ("All files", "*.*"),
        ]
        path = filedialog.askopenfilename(title="Select image", filetypes=filetypes)
        if not path:
            return

        # Repo root = one level up from BASE_DIR (assuming tools/ inside repo)
        repo_root = os.path.abspath(os.path.join(BASE_DIR, ".."))
        try:
            rel = os.path.relpath(path, repo_root)
        except ValueError:
            rel = path

        self.entry_image.delete(0, tk.END)
        self.entry_image.insert(0, rel.replace("\\", "/"))

    # -----------------------------
    # Generate snippet button
    # -----------------------------
    def generate_snippet_and_notify(self):
        generate_html_snippet(self.root)
        messagebox.showinfo(
            "HTML Generated",
            f"Snippet generated:\n{SNIPPET_FILE}\n\n"
            "Open this file and copy the <article> blocks into your index.html "
            "inside the .project-grid.",
        )


# -------------------------------------------------------------------
# Entry point
# -------------------------------------------------------------------

if __name__ == "__main__":
    app = ProjectManagerGUI()
    app.mainloop()