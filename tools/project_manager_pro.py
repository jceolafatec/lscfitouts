#!/usr/bin/env python3
"""
Enhanced Portfolio Project Manager (PRO)

Features:
- Full CRUD for projects with 3D model support
- Fields: title, meta, description, image, model_path, tags, github_link, demo_link
- Drag-and-drop file support (auto-copy to assets)
- JSON storage (primary) + XML export
- Generate HTML snippet and projects.json simultaneously
- Window for viewing project details
- Built-in validation and feedback

Turn into .exe: pyinstaller --onefile project_manager_pro.py
"""

import os
import json
import shutil
import xml.etree.ElementTree as ET
import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from pathlib import Path

# -------------------------------------------------------------------
# Paths / Constants
# -------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
JSON_FILE = os.path.join(REPO_ROOT, "assets", "data", "projects.json")
XML_FILE = os.path.join(BASE_DIR, "projects.xml")
SNIPPET_FILE = os.path.join(BASE_DIR, "projects_snippet.html")
ASSETS_IMG = os.path.join(REPO_ROOT, "assets", "img")
ASSETS_MODELS = os.path.join(REPO_ROOT, "assets", "models")

# Ensure directories exist
Path(ASSETS_IMG).mkdir(parents=True, exist_ok=True)
Path(ASSETS_MODELS).mkdir(parents=True, exist_ok=True)
Path(os.path.dirname(JSON_FILE)).mkdir(parents=True, exist_ok=True)


# -------------------------------------------------------------------
# JSON Handling (Primary data store)
# -------------------------------------------------------------------

def load_projects_json():
    """Load projects from JSON. Return list of dicts."""
    if not os.path.exists(JSON_FILE):
        return []
    try:
        with open(JSON_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except (json.JSONDecodeError, IOError):
        return []


def save_projects_json(projects):
    """Save projects list to JSON."""
    with open(JSON_FILE, "w", encoding="utf-8") as f:
        json.dump(projects, f, indent=2, ensure_ascii=False)


def get_next_id(projects):
    """Get next ID from existing projects."""
    ids = [int(p.get("id", "0")) for p in projects if str(p.get("id")).isdigit()]
    return str((max(ids) if ids else 0) + 1)


def copy_file_to_assets(src_path, asset_type="img"):
    """
    Copy file to assets folder, return relative path.
    asset_type: 'img' or 'models'
    """
    if not os.path.exists(src_path):
        return None
    
    target_dir = ASSETS_IMG if asset_type == "img" else ASSETS_MODELS
    filename = os.path.basename(src_path)
    target_path = os.path.join(target_dir, filename)
    
    try:
        shutil.copy2(src_path, target_path)
        # Return relative path from repo root
        rel_path = os.path.relpath(target_path, REPO_ROOT)
        return rel_path.replace("\\", "/")
    except Exception as e:
        print(f"Error copying file: {e}")
        return None


# -------------------------------------------------------------------
# XML Export (backward compatibility)
# -------------------------------------------------------------------

def export_to_xml(projects):
    """Export projects to XML format."""
    root = ET.Element("projects")
    for p in projects:
        project_el = ET.SubElement(root, "project", id=str(p.get("id", "")))
        ET.SubElement(project_el, "title").text = p.get("title", "")
        ET.SubElement(project_el, "meta").text = p.get("meta", "")
        ET.SubElement(project_el, "description").text = p.get("description", "")
        ET.SubElement(project_el, "image").text = p.get("image", "")
        ET.SubElement(project_el, "model").text = p.get("model_path", "")
        ET.SubElement(project_el, "tags").text = ",".join(p.get("tags", []))
        ET.SubElement(project_el, "github").text = p.get("github_link", "")
        ET.SubElement(project_el, "demo").text = p.get("demo_link", "")
    
    tree = ET.ElementTree(root)
    tree.write(XML_FILE, encoding="utf-8", xml_declaration=True)


# -------------------------------------------------------------------
# HTML Snippet Generation
# -------------------------------------------------------------------

def generate_html_snippet(projects):
    """Generate HTML snippet from projects."""
    cards = []
    for p in projects:
        title = p.get("title", "(Untitled)")
        meta = p.get("meta", "")
        description = p.get("description", "")
        image = p.get("image", "")
        model = p.get("model_path", "")
        pid = p.get("id", "")
        
        if image:
            media_html = f'''<div class="project-media">
    <img src="{image}" alt="{title}" loading="lazy">
</div>'''
        else:
            media_html = '''<div class="project-media placeholder">
    <span class="project-media-label">No Image</span>
</div>'''
        
        # Add 3D button if model exists
        extra_html = ""
        if model:
            extra_html = f'''
    <div class="project-actions">
        <a href="project-3d.html?model={model}" class="btn-view-3d">View 3D Model</a>
    </div>'''
        
        card_html = f"""<article class="project-card" data-id="{pid}">
    {media_html}
    <div class="project-body">
        <h3 class="project-title">{title}</h3>
        <p class="project-meta">{meta}</p>
        <p class="project-description">
            {description}
        </p>{extra_html}
    </div>
</article>"""
        
        cards.append(card_html)
    
    content = "\n\n".join(cards)
    with open(SNIPPET_FILE, "w", encoding="utf-8") as f:
        f.write(content)


# -------------------------------------------------------------------
# Tkinter GUI
# -------------------------------------------------------------------

class ProjectManagerProGUI(tk.Tk):
    def __init__(self):
        super().__init__()
        
        self.title("Portfolio Manager PRO")
        self.minsize(1000, 650)
        
        # Load projects
        self.projects = load_projects_json()
        self.current_index = None
        
        self._build_ui()
        self._populate_project_list()
    
    # -------------------------
    # UI Layout
    # -------------------------
    
    def _build_ui(self):
        """Build the main UI layout."""
        main = ttk.Frame(self, padding=10)
        main.pack(fill="both", expand=True)
        
        # ===== LEFT: Project List =====
        left_frame = ttk.Frame(main, width=300)
        left_frame.pack(side="left", fill="y", padx=(0, 10))
        
        ttk.Label(left_frame, text="Projects", font=("Segoe UI", 11, "bold")).pack(
            anchor="w", pady=(0, 5)
        )
        
        # Listbox with scrollbar
        list_frame = ttk.Frame(left_frame)
        list_frame.pack(fill="both", expand=True, pady=(0, 8))
        
        scrollbar = ttk.Scrollbar(list_frame)
        scrollbar.pack(side="right", fill="y")
        
        self.project_listbox = tk.Listbox(
            list_frame,
            exportselection=False,
            yscrollcommand=scrollbar.set
        )
        self.project_listbox.pack(side="left", fill="both", expand=True)
        scrollbar.config(command=self.project_listbox.yview)
        self.project_listbox.bind("<<ListboxSelect>>", self._on_project_select)
        
        # Buttons
        btn_frame = ttk.Frame(left_frame)
        btn_frame.pack(fill="x")
        
        ttk.Button(btn_frame, text="➕ New", command=self.new_project).pack(
            side="left", expand=True, fill="x", padx=(0, 4)
        )
        ttk.Button(btn_frame, text="❌ Delete", command=self.delete_project).pack(
            side="left", expand=True, fill="x", padx=(4, 0)
        )
        
        # ===== RIGHT: Detail Form =====
        right_frame = ttk.Frame(main)
        right_frame.pack(side="right", fill="both", expand=True)
        
        # Create a notebook (tabs) for organization
        notebook = ttk.Notebook(right_frame)
        notebook.pack(fill="both", expand=True)
        
        # TAB 1: Basic Info
        basic_tab = ttk.Frame(notebook, padding=10)
        notebook.add(basic_tab, text="Basic Info")
        
        ttk.Label(basic_tab, text="Title *").grid(row=0, column=0, sticky="w")
        self.entry_title = ttk.Entry(basic_tab, width=40)
        self.entry_title.grid(row=0, column=1, sticky="ew", padx=(0, 10))
        
        ttk.Label(basic_tab, text="Meta (e.g. UI Design · 2025)").grid(row=1, column=0, sticky="w", pady=(8, 0))
        self.entry_meta = ttk.Entry(basic_tab, width=40)
        self.entry_meta.grid(row=1, column=1, sticky="ew", padx=(0, 10), pady=(8, 0))
        
        ttk.Label(basic_tab, text="Description").grid(row=2, column=0, sticky="nw", pady=(8, 0))
        self.text_description = tk.Text(basic_tab, height=5, width=40, wrap="word")
        self.text_description.grid(row=2, column=1, sticky="nw", padx=(0, 10), pady=(8, 0))
        
        # TAB 2: Media & Files
        media_tab = ttk.Frame(notebook, padding=10)
        notebook.add(media_tab, text="Media & Files")
        
        ttk.Label(media_tab, text="Image Path").grid(row=0, column=0, sticky="w")
        img_frame = ttk.Frame(media_tab)
        img_frame.grid(row=0, column=1, sticky="ew", padx=(0, 10))
        img_frame.columnconfigure(0, weight=1)
        
        self.entry_image = ttk.Entry(img_frame)
        self.entry_image.pack(side="left", fill="x", expand=True)
        ttk.Button(img_frame, text="Browse", command=self.browse_image, width=10).pack(
            side="left", padx=(4, 0)
        )
        
        ttk.Label(media_tab, text="3D Model Path").grid(row=1, column=0, sticky="w", pady=(8, 0))
        model_frame = ttk.Frame(media_tab)
        model_frame.grid(row=1, column=1, sticky="ew", padx=(0, 10), pady=(8, 0))
        model_frame.columnconfigure(0, weight=1)
        
        self.entry_model = ttk.Entry(model_frame)
        self.entry_model.pack(side="left", fill="x", expand=True)
        ttk.Button(model_frame, text="Browse", command=self.browse_model, width=10).pack(
            side="left", padx=(4, 0)
        )
        
        # TAB 3: Links & Tags
        links_tab = ttk.Frame(notebook, padding=10)
        notebook.add(links_tab, text="Links & Tags")
        
        ttk.Label(links_tab, text="GitHub Link").grid(row=0, column=0, sticky="w")
        self.entry_github = ttk.Entry(links_tab, width=40)
        self.entry_github.grid(row=0, column=1, sticky="ew", padx=(0, 10))
        
        ttk.Label(links_tab, text="Demo/Live Link").grid(row=1, column=0, sticky="w", pady=(8, 0))
        self.entry_demo = ttk.Entry(links_tab, width=40)
        self.entry_demo.grid(row=1, column=1, sticky="ew", padx=(0, 10), pady=(8, 0))
        
        ttk.Label(links_tab, text="Tags (comma-separated)").grid(row=2, column=0, sticky="nw", pady=(8, 0))
        self.entry_tags = tk.Text(links_tab, height=3, width=40, wrap="word")
        self.entry_tags.grid(row=2, column=1, sticky="nw", padx=(0, 10), pady=(8, 0))
        
        links_tab.columnconfigure(1, weight=1)
        
        # Bottom action buttons
        action_frame = ttk.Frame(right_frame)
        action_frame.pack(fill="x", pady=(8, 0))
        
        ttk.Button(action_frame, text="💾 Save Project", command=self.save_project).pack(
            side="left", expand=True, fill="x", padx=(0, 4)
        )
        ttk.Button(action_frame, text="📄 Export All", command=self.export_all).pack(
            side="left", expand=True, fill="x", padx=(4, 0)
        )
        
        # Configure grid weights
        basic_tab.columnconfigure(1, weight=1)
        media_tab.columnconfigure(1, weight=1)
    
    # -------------------------
    # Helper: List population
    # -------------------------
    
    def _populate_project_list(self):
        """Refresh project listbox."""
        self.project_listbox.delete(0, tk.END)
        for p in self.projects:
            label = p.get("title") or "(Untitled)"
            meta = p.get("meta")
            if meta:
                label += f" – {meta}"
            self.project_listbox.insert(tk.END, label)
        
        if self.projects:
            self.project_listbox.select_set(0)
            self._load_project_into_form(0)
    
    # -------------------------
    # Event: Select project
    # -------------------------
    
    def _on_project_select(self, event):
        """Handle project selection."""
        selection = self.project_listbox.curselection()
        if selection:
            self._load_project_into_form(selection[0])
    
    def _load_project_into_form(self, index):
        """Load project data into form fields."""
        if index < 0 or index >= len(self.projects):
            return
        
        self.current_index = index
        p = self.projects[index]
        
        # Clear form
        self.entry_title.delete(0, tk.END)
        self.entry_meta.delete(0, tk.END)
        self.text_description.delete("1.0", tk.END)
        self.entry_image.delete(0, tk.END)
        self.entry_model.delete(0, tk.END)
        self.entry_github.delete(0, tk.END)
        self.entry_demo.delete(0, tk.END)
        self.entry_tags.delete("1.0", tk.END)
        
        # Fill form
        self.entry_title.insert(0, p.get("title", ""))
        self.entry_meta.insert(0, p.get("meta", ""))
        self.text_description.insert("1.0", p.get("description", ""))
        self.entry_image.insert(0, p.get("image", ""))
        self.entry_model.insert(0, p.get("model_path", ""))
        self.entry_github.insert(0, p.get("github_link", ""))
        self.entry_demo.insert(0, p.get("demo_link", ""))
        tags_str = ", ".join(p.get("tags", []))
        self.entry_tags.insert("1.0", tags_str)
    
    # -------------------------
    # New / Delete
    # -------------------------
    
    def new_project(self):
        """Create a blank form for a new project."""
        self.current_index = None
        self.entry_title.delete(0, tk.END)
        self.entry_meta.delete(0, tk.END)
        self.text_description.delete("1.0", tk.END)
        self.entry_image.delete(0, tk.END)
        self.entry_model.delete(0, tk.END)
        self.entry_github.delete(0, tk.END)
        self.entry_demo.delete(0, tk.END)
        self.entry_tags.delete("1.0", tk.END)
        self.project_listbox.selection_clear(0, tk.END)
        messagebox.showinfo("New Project", "Fill in the fields and click 'Save Project'.")
    
    def delete_project(self):
        """Delete the selected project."""
        if self.current_index is None or not self.projects:
            messagebox.showwarning("Delete", "No project selected.")
            return
        
        p = self.projects[self.current_index]
        title = p.get("title", "(Untitled)")
        
        if not messagebox.askyesno("Confirm", f"Delete '{title}'?\nThis cannot be undone."):
            return
        
        del self.projects[self.current_index]
        save_projects_json(self.projects)
        self.current_index = None
        self._populate_project_list()
        messagebox.showinfo("Deleted", f"Project '{title}' deleted.")
    
    # -------------------------
    # Save / Update
    # -------------------------
    
    def save_project(self):
        """Save or update the current project."""
        title = self.entry_title.get().strip()
        meta = self.entry_meta.get().strip()
        description = self.text_description.get("1.0", tk.END).strip()
        image = self.entry_image.get().strip()
        model = self.entry_model.get().strip()
        github = self.entry_github.get().strip()
        demo = self.entry_demo.get().strip()
        tags_str = self.entry_tags.get("1.0", tk.END).strip()
        tags = [t.strip() for t in tags_str.split(",") if t.strip()]
        
        if not title:
            messagebox.showwarning("Validation", "Title is required.")
            return
        
        project_data = {
            "title": title,
            "meta": meta,
            "description": description,
            "image": image,
            "model_path": model,
            "github_link": github,
            "demo_link": demo,
            "tags": tags,
        }
        
        if self.current_index is None:
            # New project
            project_data["id"] = get_next_id(self.projects)
            self.projects.append(project_data)
        else:
            # Update existing
            project_data["id"] = self.projects[self.current_index].get("id")
            self.projects[self.current_index] = project_data
        
        save_projects_json(self.projects)
        self._populate_project_list()
        messagebox.showinfo("Saved", "Project saved successfully.")
    
    # -------------------------
    # File browsing
    # -------------------------
    
    def browse_image(self):
        """Browse and copy image to assets."""
        filetypes = [
            ("Images", "*.png *.jpg *.jpeg *.gif *.webp *.bmp"),
            ("All files", "*.*"),
        ]
        path = filedialog.askopenfilename(title="Select image", filetypes=filetypes)
        if not path:
            return
        
        rel_path = copy_file_to_assets(path, "img")
        if rel_path:
            self.entry_image.delete(0, tk.END)
            self.entry_image.insert(0, rel_path)
            messagebox.showinfo("Copied", f"Image copied to assets/img/\nPath: {rel_path}")
        else:
            messagebox.showerror("Error", "Could not copy image.")
    
    def browse_model(self):
        """Browse and copy 3D model to assets."""
        filetypes = [
            ("3D Models", "*.glb *.gltf *.obj *.fbx"),
            ("GLB files", "*.glb"),
            ("GLTF files", "*.gltf"),
            ("All files", "*.*"),
        ]
        path = filedialog.askopenfilename(title="Select 3D model", filetypes=filetypes)
        if not path:
            return
        
        rel_path = copy_file_to_assets(path, "models")
        if rel_path:
            self.entry_model.delete(0, tk.END)
            self.entry_model.insert(0, rel_path)
            messagebox.showinfo("Copied", f"Model copied to assets/models/\nPath: {rel_path}")
        else:
            messagebox.showerror("Error", "Could not copy model.")
    
    # -------------------------
    # Export
    # -------------------------
    
    def export_all(self):
        """Export to JSON, XML, and HTML snippet."""
        save_projects_json(self.projects)
        export_to_xml(self.projects)
        generate_html_snippet(self.projects)
        
        messagebox.showinfo(
            "Exported",
            f"✔ Saved to projects.json\n"
            f"✔ Generated projects.xml (backup)\n"
            f"✔ Generated HTML snippet\n\n"
            f"Next: Copy projects_snippet.html into index.html\n"
            f"or use the JSON loader in your website."
        )


# -------------------------------------------------------------------
# Entry Point
# -------------------------------------------------------------------

if __name__ == "__main__":
    app = ProjectManagerProGUI()
    app.mainloop()
