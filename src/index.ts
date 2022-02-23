import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import * as bootstrap from "bootstrap";
import { ImageAnalyzer } from "./imageAnalyzer";
import { MAX_PICTURE_SIZE,debugMsg} from "./utilities";
import cv, { Mat, Rect} from "../opencv-ts/src/opencv";

    
const enum Phase { Initial = 0, VideoLoaded = 10, BackgroundDetected = 20, ObjectMasked = 25, MotionAnaized = 30 };
const phase = {
    p: Phase.Initial,
    equalsTo: function (phase: Phase) { return this.p == phase; },
    lessThan: function (phase: Phase) { return this.p < phase; },
    changeTo: function (phase: Phase) { this.p = phase; this.report();},
    reduceTo: function (phase: Phase) { if (this.p > phase) { this.p = phase; this.report(); } },
    report: function () { console.log("phase chaged to : " + this.p);}
};

let imageAnalyzer: ImageAnalyzer;

let selectedFile: HTMLInputElement;
let videoInputVideo: HTMLVideoElement;
let videoCanvas: HTMLCanvasElement;
let adjustParametersCanvas: HTMLCanvasElement;
let binaryCheckCanvas: HTMLCanvasElement;
let storoboCanvas: HTMLCanvasElement;
let trajectoryCanvas: HTMLCanvasElement;

let videoInputTabButton: HTMLButtonElement;
let adjustParametersTabButton: HTMLButtonElement;
let motionAnalyzeTabButton: HTMLButtonElement;

const rangeInput: { [str: string]: HTMLInputElement } = {};
const rangeText: { [str: string]: HTMLElement } = {};

window.addEventListener('load', () => {
    
    document.documentElement.style.setProperty("--max-picture-size", `${MAX_PICTURE_SIZE}px`);
    
    selectedFile = document.getElementById("selectedFile") as HTMLInputElement;
    videoInputVideo = document.getElementById("videoInput") as HTMLVideoElement;
    videoCanvas = document.getElementById("videoCanvas") as HTMLCanvasElement;
    adjustParametersCanvas = document.getElementById("adjustParametersCanvas") as HTMLCanvasElement;
    binaryCheckCanvas = document.getElementById("binaryCheckCanvas") as HTMLCanvasElement;
    trajectoryCanvas = document.getElementById("trajectoryCanvas") as HTMLCanvasElement;
    storoboCanvas = document.getElementById("storoboCanvas") as HTMLCanvasElement;

    videoInputTabButton = document.querySelector('button[data-bs-target="#videoInputTab"]');
    adjustParametersTabButton = document.querySelector('button[data-bs-target="#adjustParametersTab"]');
    motionAnalyzeTabButton = document.querySelector('button[data-bs-target="#motionAnalyzeTab"]');

    updateInputVideo();

    ["Up", "Down", "Left", "Right"].forEach(str => { 
        const inputElement = document.getElementById(`range${str}Input`) as HTMLInputElement;
        const textElement = document.getElementById(`range${str}Text`) as HTMLElement;
        rangeInput[str] = inputElement;
        rangeText[str] = textElement;

        inputElement.addEventListener("input", (e) => {
            textElement.textContent = inputElement.value.toString();
            const x1 = Number.parseInt(rangeInput["Left"].value);
            const y1 = Number.parseInt(rangeInput["Up"].value);
            const x2 = Number.parseInt(rangeInput["Right"].value);
            const y2 = Number.parseInt(rangeInput["Down"].value);
            if(imageAnalyzer?.setRegion(x1, y1, x2, y2)) phase.reduceTo(Phase.VideoLoaded);
            
            const ctx = videoCanvas.getContext("2d");
            const w = videoInputVideo.width;
            const h = videoInputVideo.height;
            videoCanvas.width = w;
            videoCanvas.height = h;
            ctx.clearRect(0, 0, w, h);
            ctx.beginPath();
            ctx.moveTo(x1, 0); ctx.lineTo(x1, h);
            ctx.moveTo(x2, 0); ctx.lineTo(x2, h);
            ctx.moveTo(0, y1); ctx.lineTo(w, y1);
            ctx.moveTo(0, y2); ctx.lineTo(w, y2);
            ctx.strokeStyle = "#3F3";
            ctx.lineWidth = 3;
            ctx.stroke();
        });
    });


    /* tabs */
    videoInputTabButton.addEventListener("hide.bs.tab", (e) => {
        const message = imageAnalyzer?.validateVideoInput() ?? "動画ファイルを選択してください。";
        if (message==="") {
            return;
        }
        else {
            e.preventDefault();
            showErrorModal(message);
        }
    });
    adjustParametersTabButton.addEventListener("hide.bs.tab", (e) => {

    });

    videoInputTabButton.addEventListener("shown.bs.tab", (e) => {
        updateInputVideo();
    });
    
    adjustParametersTabButton.addEventListener("shown.bs.tab", async (e) => {
        await updateCheckBackgroundAsync();

        const canvases: HTMLCanvasElement[] = [];
        document.querySelectorAll(".testcanvas").forEach(e => canvases.push(<HTMLCanvasElement>e));
        imageAnalyzer.test(canvases);
    });

    motionAnalyzeTabButton.addEventListener("shown.bs.tab", async(e) => {
        if (phase.lessThan(Phase.ObjectMasked)) {
            bootstrap.Tab.getOrCreateInstance(adjustParametersTabButton).show();
        }
        else if (phase.equalsTo(Phase.ObjectMasked)) {
            await updateMotionAnalyzeAsync();
        }
    });

    /* InputVideo  */
    selectedFile.addEventListener("change", async (e) => {
        debugMsg(`selectedFile.files.length:${selectedFile.files.length}`);
        if (selectedFile.files.length > 0) {
            debugMsg(`selectedFile.files[0].name:${selectedFile.files[0].name}`);
            if (imageAnalyzer) {
                imageAnalyzer.dispose();
                imageAnalyzer = undefined;
                phase.changeTo(Phase.Initial);
            }
            updateInputVideo();
            try {
                imageAnalyzer = await ImageAnalyzer.createAsync(videoInputVideo, selectedFile.files[0]);
                await imageAnalyzer.setCurrentTimeAsync(0);
                phase.changeTo(Phase.VideoLoaded);
            }
            catch {
                debugMsg("ImageAnalyzer.createAsyncに失敗");
                imageAnalyzer = undefined;
            }
        }
        updateInputVideo();
        
    }, false);

    (document.getElementById("startTimeSetButton") as HTMLButtonElement).onclick = () => {
        if (imageAnalyzer) {
            const changed = imageAnalyzer.setStartTime();
            if (changed) phase.reduceTo(Phase.VideoLoaded);
        }
        else {
            showErrorModal("動画ファイルが選択されていません");
        }
        updateInputVideo();
    }
    (document.getElementById("endTimeSetButton") as HTMLButtonElement).onclick = () => {
        if (imageAnalyzer) {
            const changed = imageAnalyzer.setEndTime();
            if (changed) phase.reduceTo(Phase.VideoLoaded);
        }
        else {
            showErrorModal("動画ファイルが選択されていません");
        }
        updateInputVideo();
    }
});

function updateInputVideo() {
    if (imageAnalyzer) {
        const p = imageAnalyzer.p;
        imageAnalyzer.updateSrcFromVideoCapture();
        document.getElementById("startTimeText").textContent = `${p.startTime.toFixed(2)} s`;
        document.getElementById("endTimeText").textContent = `${p.endTime.toFixed(2)} s`;
        
        rangeInput["Up"].max      = p.targetHeight.toString();
        rangeInput["Down"].max    = p.targetHeight.toString();
        rangeInput["Left"].max    = p.targetWidth.toString();
        rangeInput["Right"].max   = p.targetWidth.toString();
        rangeInput["Up"].value    = p.region.y.toString();
        rangeInput["Down"].value  = (p.region.y+p.region.height).toString();
        rangeInput["Left"].value  = p.region.x.toString();
        rangeInput["Right"].value = (p.region.x+p.region.width).toString();
        rangeInput["Up"].dispatchEvent(new Event("input"));
        rangeInput["Down"].dispatchEvent(new Event("input"));
        rangeInput["Left"].dispatchEvent(new Event("input"));
        rangeInput["Right"].dispatchEvent(new Event("input"));
    }

    const hideVideInputContent = phase.lessThan(Phase.VideoLoaded);
    videoInputVideo.hidden = hideVideInputContent;
    videoCanvas.hidden = hideVideInputContent;
    document.getElementById("videoInputCardTime").hidden = hideVideInputContent;
    document.getElementById("videoInputCardSpace").hidden = hideVideInputContent;
}

async function updateCheckBackgroundAsync() {
    const bar = document.getElementById("adjustParametersProgressbar");
    bar.parentElement.hidden = false;
    const barUpdate1 = (p: number) => bar.style.width = (p * 80).toFixed() + "%";
    const barUpdate2 = (p: number) => bar.style.width = (p * 20 + 80).toFixed() + "%";
    barUpdate1(0);

    adjustParametersCanvas.getContext("2d").clearRect(0, 0, adjustParametersCanvas.width, adjustParametersCanvas.height);
    binaryCheckCanvas.getContext("2d").clearRect(0, 0, binaryCheckCanvas.width, binaryCheckCanvas.height);
    await imageAnalyzer.calcBackgroundAsync(barUpdate1)
        .then(() => cv.imshow(adjustParametersCanvas, imageAnalyzer.r.backRegionMat))
        .then(() => imageAnalyzer.calcBinaryCheckMatAsync(barUpdate2))
        .then(() => cv.imshow(binaryCheckCanvas, imageAnalyzer.r.binaryCheckMat))
        .then(() => bar.parentElement.hidden = true)
        .then(() => phase.changeTo(Phase.ObjectMasked));
}
async function updateMotionAnalyzeAsync() {
    const bar = document.getElementById("motionAnalyzeProgressbar");
    bar.parentElement.hidden = false;
    const barUpdate = (p: number) => bar.style.width = (p * 100).toFixed() + "%";
    barUpdate(0);

    storoboCanvas.getContext("2d").clearRect(0, 0, storoboCanvas.width, storoboCanvas.height);
    trajectoryCanvas.getContext("2d").clearRect(0, 0, trajectoryCanvas.width, trajectoryCanvas.height);
    
    await imageAnalyzer.calcMotionDataAsync(barUpdate)
        .then(() => cv.imshow(storoboCanvas, imageAnalyzer.r.storoboMat))
        .then(() => cv.imshow(trajectoryCanvas, imageAnalyzer.r.trajectoryMat))
        .then(() => bar.parentElement.hidden = true);
}

function showErrorModal(str: string) {
    document.getElementById("modalErrorText").textContent = str;
    new bootstrap.Modal(document.getElementById("modalAlert")).show();
}
