import { LCCLoader } from './lcc-loader.mjs';
import { GaussianSplatRenderer } from './splat-renderer.mjs';

const API = 'https://d1rfabreh9lcnl.cloudfront.net/api';
const DEFAULT_LCC_URL = 'https://d2pqszqfxcodwz.cloudfront.net/lcc-model/showroom+level+2/showroom2.lcc';

const CAMERA_STATE_A = {"version":"2.0","seedURN":"dXJuOmFkc2sub2JqZWN0czpvcy5vYmplY3Q6c2FtcGxlbW9kZWxzL09mZmljZS5ydnQ","objectSet":[{"id":[1504],"idType":"lmv","isolated":[],"hidden":[],"explodeScale":0,"explodeOptions":{"magnitude":4,"depthDampening":0}}],"viewport":{"aspectRatio":2.4750778816199377,"isOrthographic":false,"name":"","eye":[-23.190203988407344,-4.04510142418426,2.359664531962506],"target":[-9.869688866965479,-4.95755021046743,0.38035835802711015],"up":[0.14629805875433052,-0.010021345640837597,0.9891897950526286],"distanceToOrbit":19.391119757697673,"projection":"perspective","worldUpVector":[0,0,1],"pivotPoint":[-4.176891207695007,-0.2523587942123413,-3.666666865348816],"fieldOfView":53.13010235415598},"autocam":{"sceneUpDirection":{"x":0,"y":0,"z":1},"sceneFrontDirection":{"x":0,"y":1,"z":0},"cubeFront":{"x":1,"y":0,"z":0}},"renderOptions":{"environment":"Boardwalk","ambientOcclusion":{"enabled":true,"radius":13.123359580052492,"intensity":1},"toneMap":{"method":1,"exposure":-7,"lightMultiplier":-1e-20},"appearance":{"ghostHidden":true,"ambientShadow":true,"antiAliasing":false,"progressiveDisplay":true,"swapBlackAndWhite":false,"displayLines":true,"displayPoints":true}},"cutplanes":[[-1,0,2.220446049250313e-16,-6.655789852142333]]};

const CAMERA_STATE_B = {"version":"2.0","seedURN":"dXJuOmFkc2sub2JqZWN0czpvcy5vYmplY3Q6c2FtcGxlbW9kZWxzL09mZmljZS5ydnQ","objectSet":[{"id":[1504],"idType":"lmv","isolated":[],"hidden":[],"explodeScale":0,"explodeOptions":{"magnitude":4,"depthDampening":0}}],"viewport":{"aspectRatio":2.4750778816199377,"isOrthographic":false,"name":"","eye":[-24.638957719114533,21.543414494801546,31.04080152525615],"target":[-19.469090079250613,14.984406548915029,20.437112442186283],"up":[0.4863089502122613,-0.6169798708196544,0.6187402071522512],"distanceToOrbit":45.69479844121397,"projection":"perspective","worldUpVector":[0,0,1],"pivotPoint":[-4.176891207695007,-0.2523587942123413,-3.666666865348816],"fieldOfView":53.13010235415598},"autocam":{"sceneUpDirection":{"x":0,"y":0,"z":1},"sceneFrontDirection":{"x":0,"y":1,"z":0},"cubeFront":{"x":1,"y":0,"z":0}},"renderOptions":{"environment":"Boardwalk","ambientOcclusion":{"enabled":true,"radius":13.123359580052492,"intensity":1},"toneMap":{"method":1,"exposure":-7,"lightMultiplier":-1e-20},"appearance":{"ghostHidden":true,"ambientShadow":true,"antiAliasing":false,"progressiveDisplay":true,"swapBlackAndWhite":false,"displayLines":true,"displayPoints":true}},"cutplanes":[[-0.08896389603614807,0,0.9960348606109619,1.6645354824845668]]};

const CAMERA_STATE_C = {"version":"2.0","seedURN":"dXJuOmFkc2sub2JqZWN0czpvcy5vYmplY3Q6c2FtcGxlbW9kZWxzL09mZmljZS5ydnQ","objectSet":[{"id":[1504],"idType":"lmv","isolated":[],"hidden":[],"explodeScale":0,"explodeOptions":{"magnitude":4,"depthDampening":0}}],"viewport":{"aspectRatio":2.4750778816199377,"isOrthographic":false,"name":"","eye":[50.96789016834946,-98.18837068928497,69.4835346305388],"target":[45.385086468168616,-88.38613302063129,62.07173469052392],"up":[-0.2717606567341433,0.47715497254743067,0.83574474429977],"distanceToOrbit":134.22476847595664,"projection":"perspective","worldUpVector":[0,0,1],"pivotPoint":[1.3958335832215465,-0.16645542821933113,-7.978445229249701],"fieldOfView":53.13010235415598},"autocam":{"sceneUpDirection":{"x":0,"y":0,"z":1},"sceneFrontDirection":{"x":0,"y":1,"z":0},"cubeFront":{"x":1,"y":0,"z":0}},"renderOptions":{"environment":"Boardwalk","ambientOcclusion":{"enabled":true,"radius":13.123359580052492,"intensity":1},"toneMap":{"method":1,"exposure":-7,"lightMultiplier":-1e-20},"appearance":{"ghostHidden":true,"ambientShadow":true,"antiAliasing":false,"progressiveDisplay":true,"swapBlackAndWhite":false,"displayLines":true,"displayPoints":true}},"cutplanes":[]};

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
        viewer.autocam.shotParams.destinationPercent = 3;
        viewer.autocam.shotParams.duration = 3;
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
        if (name.toLowerCase() === 'office.rvt') opt.selected = true;
        select.appendChild(opt);
    });
    const officeRvt = models.find(m => m.name.toLowerCase() === 'office.rvt');
    if (officeRvt) loadModel(officeRvt.urn);
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
        const { clientWidth, clientHeight } = viewer.container;
        splatRenderer.resize(clientWidth, clientHeight);

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

viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, () => {
    viewer.navigation.toPerspective();
});

await populateModels();

const lccUrl = new URLSearchParams(location.search).get('lcc') || DEFAULT_LCC_URL;
await loadSplats(lccUrl);

if (splatRenderer) {
    splatRenderer.update(viewer.impl.camera);
    viewer.impl.invalidate(false, false, true);
}

document.getElementById('viewA').addEventListener('click', () => viewer.restoreState(CAMERA_STATE_A));
document.getElementById('viewB').addEventListener('click', () => viewer.restoreState(CAMERA_STATE_B));
document.getElementById('viewC').addEventListener('click', () => viewer.restoreState(CAMERA_STATE_C));

window.addEventListener('resize', () => {
    const { clientWidth, clientHeight } = viewer.container;
    splatRenderer?.resize(clientWidth, clientHeight);
});
