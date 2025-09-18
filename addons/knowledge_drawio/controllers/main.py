from odoo.addons.web.controllers.main import WebClient

class DrawioWebClient(WebClient):
    def _get_csp(self):
        csp = super()._get_csp()
        frame_src = set(csp.get('frame-src', []))
        frame_src.update({'https://embed.diagrams.net'})
        img_src = set(csp.get('img-src', []))
        img_src.update({'data:'})  # PNG data URLs
        csp['frame-src'] = list(frame_src)
        csp['img-src'] = list(img_src)
        return csp
