/** Draw.io (diagrams.net) embed integration for Knowledge.
 *  Loads/stores XML in knowledge.article.diagram_xml and optional PNG preview.
 */
odoo.define('knowledge_drawio.open_editor', function (require) {
    "use strict";

    const AbstractAction = require('web.AbstractAction');
    const core = require('web.core');
    const Dialog = require('web.Dialog');
    const rpc = require('web.rpc');
    const qweb = core.qweb;

    const EMBED_URL = "https://embed.diagrams.net/?embed=1&proto=json&spin=1&ui=min&libraries=1#";

    const DrawioEditor = AbstractAction.extend({
        start: async function () {
            const context = this.action && this.action.context || {};
            const activeId = context.active_id;
            if (!activeId) {
                this.do_warn("Draw.io", "No active Knowledge article.");
                return;
            }

            // Read current XML/name
            const [rec] = await rpc.query({
                model: 'knowledge.article',
                method: 'read',
                args: [[activeId], ['diagram_xml', 'diagram_name']],
            });
            const initialXml = (rec && rec.diagram_xml) || '';
            const fileName = (rec && rec.diagram_name) || 'diagram.drawio';

            // Open dialog with iframe
            const src = EMBED_URL;
            const $content = $(qweb.render("knowledge_drawio.EditorDialog", { props: { src } }));
            const dialog = new Dialog(this, {
                title: "Draw.io Editor",
                size: 'large',
                $content,
                buttons: [
                    { text: "Close", close: true, classes: "btn btn-secondary" },
                    { text: "Save", classes: "btn btn-primary", click: () => this._requestExport('xmlpng') },
                ],
            });

            // Keep references
            this._dialog = dialog;
            this._iframe = $content.find('iframe')[0].contentWindow;
            this._activeId = activeId;
            this._fileName = fileName;

            // Message handler
            this._onMessage = this._onMessage.bind(this);
            window.addEventListener('message', this._onMessage);

            dialog.open();

            // After open, send 'load' message with existing XML
            setTimeout(() => {
                this._post({
                    action: 'load',
                    autosave: 1,
                    xml: initialXml || null,
                    title: this._fileName,
                });
            }, 500);

            return this._super(...arguments);
        },

        destroy: function () {
            window.removeEventListener('message', this._onMessage);
            return this._super(...arguments);
        },

        _post(payload) {
            this._iframe && this._iframe.postMessage(JSON.stringify(payload), "*");
        },

        _onMessage(evt) {
            let msg = {};
            try { msg = JSON.parse(evt.data); } catch (e) { return; }
            if (!msg || !msg.event) return;

            switch (msg.event) {
                case 'init':
                    // Editor ready; request load if not sent
                    break;
                case 'save':
                    // User pressed draw.io Save -> ask for export content
                    this._requestExport('xmlpng');
                    break;
                case 'export':
                    // Receive exported data (xml / png)
                    this._handleExport(msg);
                    break;
                case 'load':
                case 'autosave':
                case 'exit':
                default:
                    break;
            }
        },

        _requestExport(format) {
            // Ask draw.io to export both XML and PNG (xmlpng)
            this._post({
                action: 'export',
                format: format,   // 'xml', 'png', or 'xmlpng'
                spin: '1',
                xml: '1',
                embedXml: '1',
                scale: 1,
            });
        },

        async _handleExport(msg) {
            try {
                const xmlData = msg.xml || '';
                // PNG comes base64 (data:image/png;base64,...) -> we need raw base64
                let pngBase64 = null;
                if (msg.data) {
                    if (msg.data.startsWith('data:image/png;base64,')) {
                        pngBase64 = msg.data.split('base64,')[1];
                    } else {
                        pngBase64 = msg.data; // already raw
                    }
                }
                // Write back to record
                await rpc.query({
                    model: 'knowledge.article',
                    method: 'write',
                    args: [[this._activeId], { diagram_xml: xmlData, diagram_png: pngBase64 }],
                });
                this.do_notify("Draw.io", "Diagram saved.");
                if (this._dialog) this._dialog.close();
            } catch (e) {
                this.do_warn("Draw.io", "Save failed: " + (e && e.message ? e.message : e));
            }
        },
    });

    core.action_registry.add('knowledge_drawio.open_editor', DrawioEditor);
    return DrawioEditor;
});
