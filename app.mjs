import { LCCLoader } from './lcc-loader.mjs';
import { GaussianSplatRenderer } from './splat-renderer.mjs';

const API = 'https://d1rfabreh9lcnl.cloudfront.net/api';
const DEFAULT_LCC_URL = 'https://d2pqszqfxcodwz.cloudfront.net/lcc-model/showroom+level+2/showroom2.lcc';

const getToken = () => fetch(`${API}/auth/token`).then(r => r.json());
const getModels = () =>
    fetch(`${API}/models/buckets?id=samplemodels`)
        .then(r => r.json())
        .then(items => items.map(m => ({ name: m.text, urn: m.id })));

const select = document.getElementById('modelSelect');
const statusEl = document.getElementById('status');

let viewer;
let splatRenderer = null;

function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
}

const initViewer = () => new Promise(resolve => {
    Autodesk.Viewing.Initializer({
        env: 'AutodeskProduction2',
        api: 'streamingV2',
        getAccessToken: async cb => {
            const { access_token, expires_in } = await getToken();
            cb(access_token, expires_in);
        }
    }, () => {
        viewer = new Autodesk.Viewing.GuiViewer3D(document.getElementById('viewer'), {
            theme: 'light-theme'
        });
        viewer.start();
        resolve();
    });
});

const loadModel = urn => {
    setStatus('Loading Revit model...');
    Autodesk.Viewing.Document.load(`urn:${urn}`, doc => {
        viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry());
        setStatus('');
    });
};

const populateModels = async () => {
    const models = await getModels();
    models.forEach(({ name, urn }) => {
        const opt = document.createElement('option');
        opt.value = urn;
        opt.textContent = name;
        if (name.endsWith('.rvt')) opt.selected = true;
        select.appendChild(opt);
    });
    const rvt = models.find(m => m.name.endsWith('.rvt'));
    if (rvt) loadModel(rvt.urn);
};

async function loadSplats(url) {
    setStatus('Loading LCC splats...');
    try {
        const loader = new LCCLoader({ targetLOD: 4 });
        const data = await loader.load(url, p => {
            setStatus(`Loading splats... ${Math.round(p * 100)}%`);
        });

        if (splatRenderer) {
            viewer.impl.removeOverlay('splats', splatRenderer.mesh);
            splatRenderer.dispose();
        }

        splatRenderer = new GaussianSplatRenderer();
        await splatRenderer.init(data);

        const METERS_TO_FEET = 3.28084;
        splatRenderer.mesh.scale.set(METERS_TO_FEET, METERS_TO_FEET, METERS_TO_FEET);
        splatRenderer.mesh.rotation.z = -Math.PI / 4;

        viewer.impl.createOverlayScene('splats');
        viewer.impl.addOverlay('splats', splatRenderer.mesh);

        setStatus(`Splats loaded: ${(data.splatCount / 1e6).toFixed(2)}M`);
    } catch (e) {
        console.error('Splat load failed:', e);
        setStatus('Splat load failed — see console');
    }
}

select.addEventListener('change', () => {
    if (select.value) loadModel(select.value);
});

await initViewer();

viewer.addEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, () => {
    if (!splatRenderer) return;
    splatRenderer.update(viewer.impl.camera);
    viewer.impl.invalidate(false, false, true);
});

viewer.addEventListener(Autodesk.Viewing.CUTPLANES_CHANGE_EVENT, () => {
    if (!splatRenderer) return;
    const planes = viewer.getCutPlanes() || [];
    splatRenderer.setCutPlanes(planes);
    viewer.impl.invalidate(false, false, true);
});

await populateModels();

const lccUrl = new URLSearchParams(location.search).get('lcc') || DEFAULT_LCC_URL;
await loadSplats(lccUrl);

if (splatRenderer) {
    splatRenderer.update(viewer.impl.camera);
    viewer.impl.invalidate(false, false, true);
}

window.addEventListener('resize', () => {
    splatRenderer?.resize(innerWidth, innerHeight);
});
