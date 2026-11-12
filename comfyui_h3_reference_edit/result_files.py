"""Recoverable result deletion, confined to ComfyUI's output directory."""
from pathlib import Path
import json
import threading
import time
import uuid


class ResultFiles:
    def __init__(self, output_root, trash_root):
        self.output_root = Path(output_root).resolve()
        self.trash_root = Path(trash_root)
        self.lock = threading.Lock()

    def destination(self, image):
        if not isinstance(image, dict) or image.get('type', 'output') != 'output':
            raise ValueError('只能删除输出图片。')
        filename = image.get('filename')
        if not isinstance(filename, str) or not filename or Path(filename).name != filename or '\\' in filename:
            raise ValueError('图片文件名无效。')
        if Path(filename).suffix.lower() not in ['.png', '.jpg', '.jpeg', '.webp']:
            raise ValueError('只支持删除图片输出。')
        subfolder = image.get('subfolder', '')
        if not isinstance(subfolder, str):
            raise ValueError('图片目录无效。')
        candidate = self.output_root / subfolder / filename
        if candidate.is_symlink():
            raise ValueError('不支持删除符号链接。')
        path = candidate.resolve()
        if not path.is_relative_to(self.output_root):
            raise ValueError('图片不在输出目录中。')
        return path

    def results(self):
        results = []
        for path in self.output_root.rglob('*'):
            if not path.is_file() or path.is_symlink() or path.name.startswith('_H3Studio_selftest_'):
                continue
            if path.suffix.lower() not in ['.png', '.jpg', '.jpeg', '.webp']:
                continue
            resolved = path.resolve()
            if not resolved.is_relative_to(self.output_root):
                continue
            relative = resolved.relative_to(self.output_root)
            subfolder = relative.parent.as_posix()
            results.append({'image': {'filename': relative.name, 'subfolder': '' if subfolder == '.' else subfolder, 'type': 'output'}, 'modified_at_ms': resolved.stat().st_mtime_ns // 1000000})
        return sorted(results, key=lambda item: item['modified_at_ms'], reverse=True)[:100]

    def items(self):
        if not self.trash_root.exists():
            return []
        results = []
        for manifest in self.trash_root.glob('*/manifest.json'):
            if (manifest.parent / 'image').is_file():
                results.append(json.loads(manifest.read_text()))
        return sorted(results, key=lambda item: item['deleted_at_ms'], reverse=True)

    def trash(self, image):
        with self.lock:
            source = self.destination(image)
            if not source.is_file():
                raise FileNotFoundError('图片已经删除或文件不存在。')
            token = str(uuid.uuid4())
            directory = self.trash_root / token
            directory.mkdir(parents=True, mode=0o700)
            item = {'token': token, 'image': {'filename': image['filename'], 'subfolder': image.get('subfolder', ''), 'type': 'output'}, 'deleted_at_ms': round(time.time() * 1000)}
            manifest = directory / 'manifest.json'
            try:
                manifest.write_text(json.dumps(item, ensure_ascii=False))
                source.replace(directory / 'image')
            except Exception:
                manifest.unlink(missing_ok=True)
                directory.rmdir()
                raise
            return item

    def restore(self, token):
        token = str(uuid.UUID(str(token)))
        with self.lock:
            directory = self.trash_root / token
            item = json.loads((directory / 'manifest.json').read_text())
            target = self.destination(item['image'])
            if target.exists():
                raise FileExistsError('原位置存在同名文件，未覆盖现有图片。')
            target.parent.mkdir(parents=True, exist_ok=True)
            (directory / 'image').replace(target)
            (directory / 'manifest.json').unlink()
            directory.rmdir()
            return item
