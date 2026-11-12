"""Loopback-only integration fixture for the native client. Uses synthetic test images."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from email.parser import BytesParser
from email.policy import default
import base64
import json
import time
import uuid
from PIL import Image, ImageDraw

root = Path('/tmp/h3-studio-qa')
root.mkdir(exist_ok=True)
for name, color in [('base','#b9a98e'),('face','#baa6a0'),('style','#94a39b'),('clothing','#8193a5'),('background','#789fac'),('result','#a7afb0')]:
    image = Image.new('RGB',(512,512),color)
    draw=ImageDraw.Draw(image)
    draw.rectangle((40,40,472,472),outline='#f5efe0',width=2)
    draw.ellipse((184,106,328,250),fill='#e8d8bd')
    draw.rounded_rectangle((135,258,377,440),40,fill='#455257')
    draw.text((58,60),'H3 STUDIO / '+name.upper()+' / TEST',fill='#ffffff')
    image.save(root/(name+'.png'))
uploads = {}
jobs = {}
requests_log = []

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def response(self,value,status=200,mime='application/json'):
        data = value if isinstance(value,bytes) else json.dumps(value).encode()
        self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def authorized(self):
        if self.headers.get('Authorization') != 'Basic '+base64.b64encode(b'test:test').decode():
            self.response({'error':'login'},401);return False
        return True
    def do_GET(self):
        if not self.authorized(): return
        path=self.path.split('?')[0]
        requests_log.append({'method':'GET','path':path})
        if path=='/system_stats':self.response({'devices':[{'name':'NVIDIA L4 · QA','vram_total':24*1024**3}]})
        elif path=='/object_info/H3ReferenceEdit':self.response({'H3ReferenceEdit':{}})
        elif path=='/userdata/colab_compute_units.json':self.response({'balance':587,'rate_per_hour':1.94,'observed_at_ms':time.time()*1000})
        elif path=='/history':
            self.response({
                'c3fcb026-46c1-4aa9-aa8e-5af857ad58ac':{'prompt':[2,'test'], 'outputs':{'9':{'images':[{'filename':'H3Studio-QA-latest.png','subfolder':'','type':'output'}]}}},
                '37b6301e-8ded-42a6-abba-0c85cb1de592':{'prompt':[1,'test'], 'outputs':{'9':{'images':[{'filename':'H3Studio-QA-older.png','subfolder':'','type':'output'}]}}}
            })
        elif path.startswith('/history/'):
            job=path.rsplit('/',1)[-1];jobs[job]+=1
            self.response({} if jobs[job]<2 else {job:{'status':{'status_str':'success'},'outputs':{'9':{'images':[{'filename':'H3Studio-QA.png','subfolder':'','type':'output'}]}}}})
        elif path=='/view':self.response((root/'result.png').read_bytes(),mime='image/png')
        else:self.response({'error':'not found'},404)
        (root/'requests.json').write_text(json.dumps(requests_log,indent=2))
    def do_POST(self):
        if not self.authorized():return
        body=self.rfile.read(int(self.headers.get('Content-Length','0')))
        if self.path=='/upload/image':
            mail=BytesParser(policy=default).parsebytes(('Content-Type: '+self.headers['Content-Type']+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+body)
            part=next(p for p in mail.iter_parts() if p.get_param('name',header='content-disposition')=='image')
            name=part.get_filename();data=part.get_payload(decode=True)
            assert data.startswith(b'\x89PNG')
            uploads[name]=len(data);requests_log.append({'method':'POST','path':self.path,'bytes':len(data)})
            self.response({'name':name,'subfolder':'','type':'input'})
        elif self.path=='/prompt':
            request=json.loads(body);prompt=request['prompt'];config=prompt['5']['inputs']
            assert prompt['5']['class_type']=='H3ReferenceEdit'
            for role in ['face','style','clothing','background']:
                if config[role+'_enabled']:assert role+'_reference' in config
            for node in prompt.values():
                if node['class_type']=='LoadImage':assert node['inputs']['image'] in uploads
            (root/'submitted.json').write_text(json.dumps(request,ensure_ascii=False,indent=2))
            job=str(uuid.uuid4());jobs[job]=0;requests_log.append({'method':'POST','path':self.path,'job':job})
            self.response({'prompt_id':job})
        else:self.response({'error':'not found'},404)
        (root/'requests.json').write_text(json.dumps(requests_log,indent=2))

print('QA server http://127.0.0.1:8799',flush=True)
ThreadingHTTPServer(('127.0.0.1',8799),Handler).serve_forever()
