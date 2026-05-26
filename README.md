# Spine Sequence Exporter

Spine Sequence Exporter is a Windows-focused tool for converting PNG image sequences into Spine-compatible JSON animation data.

It supports creating a new Spine JSON project from image frames, merging frame attachments into an existing skeleton structure, and checking or repairing common Spine JSON reference issues.

## Features

- Import PNG sequence frames and sort them naturally by file name.
- Export Spine-compatible JSON animation data.
- Configure skeleton name, animation name, FPS, image path, target slot, target bone, skin, and Spine compatibility version.
- Preview generated JSON before use.
- Analyze Spine JSON files for missing slots and orphaned references.
- Build as a web app, Electron installer, portable package, or standalone offline HTML file.

## Downloads

Packaged builds are available on the GitHub Releases page:

https://github.com/dale003/spine-sequence-exporter/releases/tag/v0.1.0

Release assets include:

- `SpineSequenceExporter-0.1.0-Setup.exe`: Windows installer.
- `SpineSequenceExporter-0.1.0-Portable.zip`: Portable Windows app.
- `SpineSequenceExporter.html`: Single-file offline HTML version.
- `README.txt`: Basic offline usage notes.

## Development

Install dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

Start the Electron development build:

```bash
npm run electron:dev
```

## Build

Build the web app:

```bash
npm run build
```

Build the standalone offline HTML version:

```bash
npm run build:standalone
```

Build the Windows installer:

```bash
npm run dist:installer
```

Build the portable Windows package:

```bash
npm run dist:portable
```

## Project Structure

- `src/`: React UI and Spine JSON export/analyze logic.
- `electron/`: Electron main and preload scripts.
- `scripts/build-standalone.mjs`: Offline single-file HTML packaging script.
- `release-*`: Local packaged output directories, excluded from Git.

## Notes

Large packaged binaries are published through GitHub Releases instead of being committed to the repository. This keeps the Git history small and avoids GitHub's normal 100 MB per-file limit.
