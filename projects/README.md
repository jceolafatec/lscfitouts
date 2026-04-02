# Projects Folder Convention

Use this layout for every client/job so dashboard indexing stays predictable:

```
projects/
  <client-slug>/
    <job-slug>/
      glb/
        <drawing-slug>/<drawing-slug>.glb
      pdf/
        <drawing-slug>/<drawing-slug>.pdf
      img/
        <drawing-slug>/cover.jpg
```

## Naming Rules

- Use lowercase slugs for folder names: `byproxy`, `knobby-pacificfair`.
- Use drawing slugs for subfolders: `j01`, `j03a`, `j03-tv-box`.
- Keep one primary model and one primary PDF per drawing slug when possible.
- Avoid spaces in filenames to reduce URL encoding issues.

## Metadata Override

When files are hosted externally, keep the same local folder shape and define links in metadata:

```xml
<drawing slug="j01" name="J01 Island Gondolas" modelUrl="https://.../J01.glb" pdfUrl="https://.../J01.pdf" imageUrl="https://.../J01.jpg" />
```

## Byproxy Cleanup Recommendation

Current byproxy files place `.glb` under `pdf/<drawing>/`.
For cleaner separation and easier maintenance, move to:

- `projects/byproxy/knobby-pacificfair/glb/j01/j01.glb`
- `projects/byproxy/knobby-pacificfair/pdf/j01/j01.pdf`
- `projects/byproxy/knobby-pacificfair/pdf/j03a/j03a.pdf`

This keeps model and drawing storage distinct and aligns with app discovery logic.
