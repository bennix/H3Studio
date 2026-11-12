"""Download template models on the Colab server, never in the browser."""
import asyncio
import json
import pathlib
import shutil
import time
import uuid
from urllib.parse import urlparse

import requests
from aiohttp import web
from server import PromptServer
import folder_paths

WEB_DIRECTORY = "./web"
NODE_CLASS_MAPPINGS = {}
ROOT = (pathlib.Path(folder_paths.base_path) / "models").resolve()
CATEGORIES = {"checkpoints", "diffusion_models", "text_encoders", "clip", "unet", "vae", "loras", "controlnet", "upscale_models", "embeddings", "clip_vision", "style_models"}
SUFFIXES = {".safetensors", ".sft", ".gguf", ".ckpt", ".pt", ".pth", ".bin"}
JOBS = {}
SLOTS = asyncio.Semaphore(1)


def validate(model):
    category = model.get("directory", "")
    name = model.get("name", "")
    url = model.get("url", "")
    if category not in CATEGORIES:
        raise ValueError("不支持的模型目录")
    if not name or pathlib.PurePosixPath(name).is_absolute() or ".." in pathlib.PurePosixPath(name).parts or "\\" in name:
        raise ValueError("模型文件名无效")
    target = (ROOT / category / name).resolve()
    if not target.is_relative_to(ROOT / category) or target.suffix.lower() not in SUFFIXES:
        raise ValueError("模型文件路径或格式无效")
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "huggingface.co" or "/resolve/" not in parsed.path or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError("目前支持 Hugging Face 的 HTTPS /resolve/ 模型直链")
    return target


def download(job):
    target = pathlib.Path(job["path"])
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_file() and target.stat().st_size > 0:
        job.update(state="完成", downloaded=target.stat().st_size, total=target.stat().st_size, existing=True)
        return
    partial = target.with_name(target.name + ".part")
    offset = partial.stat().st_size if partial.exists() else 0
    headers = {"Range": f"bytes={offset}-"} if offset else {}
    with requests.get(job["url"], headers=headers, stream=True, timeout=(30, 120)) as response:
        if response.status_code not in (200, 206):
            raise RuntimeError(f"下载失败：HTTP {response.status_code}；受限模型需先取得访问授权")
        if response.status_code != 206:
            offset = 0
        remaining = int(response.headers.get("Content-Length", "0"))
        if remaining and shutil.disk_usage(ROOT).free < remaining + 1024**3:
            raise RuntimeError("Colab 磁盘空间不足，已保留至少 1 GiB 余量")
        job.update(state="下载中", downloaded=offset, total=offset + remaining if remaining else 0)
        with partial.open("ab" if offset else "wb") as output:
            for chunk in response.iter_content(4 * 1024**2):
                if chunk:
                    output.write(chunk)
                    job["downloaded"] += len(chunk)
        if remaining and job["downloaded"] != offset + remaining:
            raise RuntimeError("下载不完整；再次点击可续传")
    if target.suffix.lower() in (".safetensors", ".sft"):
        with partial.open("rb") as model_file:
            header_size = int.from_bytes(model_file.read(8), "little")
            if not 0 < header_size < min(256 * 1024**2, partial.stat().st_size - 8):
                raise RuntimeError("下载内容不是有效的 safetensors 模型")
            json.loads(model_file.read(header_size))
    partial.replace(target)
    folder_paths.filename_list_cache.clear()
    job.update(state="完成", total=target.stat().st_size, downloaded=target.stat().st_size)


async def run_job(job):
    async with SLOTS:
        try:
            await asyncio.to_thread(download, job)
        except Exception as error:
            job.update(state="失败", error=str(error))


@PromptServer.instance.routes.post("/colab/models/download")
async def enqueue(request):
    if request.content_type != "application/json":
        return web.json_response({"error": "需要 JSON 请求"}, status=415)
    try:
        models = (await request.json()).get("models", [])
        if not isinstance(models, list) or not 1 <= len(models) <= 30:
            raise ValueError("请选择 1～30 个模型")
        targets = [validate(model) for model in models]
    except (ValueError, TypeError, AttributeError) as error:
        return web.json_response({"error": str(error)}, status=400)
    ids = []
    for model, target in zip(models, targets):
        active = next((job for job in JOBS.values() if job["path"] == str(target) and job["state"] != "失败"), None)
        if active:
            ids.append(active["id"])
            continue
        job = dict(id=uuid.uuid4().hex, name=model["name"], directory=model["directory"], url=model["url"], path=str(target), state="排队中", downloaded=0, total=0, created=time.time())
        JOBS[job["id"]] = job
        ids.append(job["id"])
        asyncio.create_task(run_job(job))
    return web.json_response({"ids": ids, "destination": str(ROOT)})


@PromptServer.instance.routes.get("/colab/models/jobs")
async def jobs(request):
    return web.json_response({"destination": str(ROOT), "jobs": [{key: value for key, value in job.items() if key != "url"} for job in JOBS.values()]})
