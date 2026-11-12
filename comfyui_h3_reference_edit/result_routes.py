from pathlib import Path
from aiohttp import web
import folder_paths
from server import PromptServer
from .result_files import ResultFiles

store = ResultFiles(folder_paths.get_output_directory(), Path(folder_paths.get_user_directory()) / 'default/h3_studio_trash')
routes = PromptServer.instance.routes


@routes.get('/h3-studio/results')
async def list_results(request):
    return web.json_response({'items': store.results()})


@routes.get('/h3-studio/results/trash')
async def list_trash(request):
    return web.json_response({'items': store.items()})


@routes.post('/h3-studio/results/trash')
async def trash_result(request):
    try:
        payload = await request.json()
        return web.json_response(store.trash(payload.get('image')))
    except FileNotFoundError as error:
        return web.json_response({'error': str(error)}, status=404)
    except ValueError as error:
        return web.json_response({'error': str(error)}, status=400)


@routes.post('/h3-studio/results/restore')
async def restore_result(request):
    try:
        payload = await request.json()
        return web.json_response(store.restore(payload.get('token')))
    except FileExistsError as error:
        return web.json_response({'error': str(error)}, status=409)
    except FileNotFoundError:
        return web.json_response({'error': '回收站记录不存在。'}, status=404)
    except ValueError as error:
        return web.json_response({'error': str(error)}, status=400)
