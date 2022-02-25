import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import * as bootstrap from "bootstrap";
import { ImageAnalyzer } from "./imageAnalyzer";
import { MAX_PICTURE_SIZE} from "./utilities";
import cv, { Mat, Rect} from "../opencv-ts/src/opencv";


let imageAnalyzer: ImageAnalyzer;

let commonProgressbar: HTMLElement;
let selectedFile: HTMLInputElement;
let videoInputVideo: HTMLVideoElement;
let videoCanvas: HTMLCanvasElement;
let adjustParametersCanvas: HTMLCanvasElement;
let binaryCheckCanvas: HTMLCanvasElement;
let storoboCanvas: HTMLCanvasElement;
let trajectoryCanvas: HTMLCanvasElement;
let xtGraphCanvas: HTMLCanvasElement;

let videoInputTabButton: HTMLButtonElement;
let adjustParametersTabButton: HTMLButtonElement;
let motionAnalyzeTabButton: HTMLButtonElement;
let outputGraphTabButton: HTMLButtonElement;
let debugTabButton: HTMLButtonElement;

let rangeThreshInput: HTMLInputElement;
let checkThreshInput:HTMLInputElement;
let rangeThreshText: HTMLElement;

const rangeInput: { [str: string]: HTMLInputElement } = {};
const rangeText: { [str: string]: HTMLElement } = {};

const enum Phase { Initial = 0, VideoNotLoaded = 5, VideoLoaded = 10, BackgroundDetected = 20, ObjectMasked = 25, MotionAnaized = 30 };
const phase = {
    _p: Phase.Initial,
    equalsTo: function (phase: Phase) { return this._p === phase; },
    lessThan: function (phase: Phase) { return this._p < phase; },
    changeTo: function (phase: Phase) { this._p = phase; this.report(); },
    reduceTo: function (phase: Phase) { if (this._p > phase) { this._p = phase; this.report(); } },
    report: function () { console.log("phase chaged to : " + this._p); }
};

type CommandFunc = (isChanceling: () => boolean) => Promise<void>;
type Status = "Idling" | "Processing" | "Canceling";
const AsyncCommand = {
    _status: "Idling" as Status,
    subscribe: function (command: string, switchToProcessing: boolean,
        onIdlingFunc: CommandFunc, onProcessingFunc: () => void = undefined) {
        if (this._status === "Idling") {
            if (switchToProcessing) {
                this._status = "Processing";
                console.log(`*** ${command} : Processing`);
            }
            onIdlingFunc(() => this._status === "Canceling")
                .then(() => {
                    if (switchToProcessing) {
                        console.log(`*** ${command} : Processing end`);
                        this._status = "Idling";
                    }
                }
            );
        }
        else if (this._status === "Processing") {
            if (onProcessingFunc) onProcessingFunc();
        }
    },
    cancel: function () {
        console.log("AsyncCommand Canceling!!");
        this._status = "Canceling";
    }
};

window.addEventListener('load', () => {
    phase.changeTo(Phase.VideoNotLoaded);
    document.documentElement.style.setProperty("--max-picture-size", `${MAX_PICTURE_SIZE}px`);
    
    commonProgressbar = document.getElementById("commonProgressbar");
    selectedFile = document.getElementById("selectedFile") as HTMLInputElement;
    videoInputVideo = document.getElementById("videoInput") as HTMLVideoElement;
    videoCanvas = document.getElementById("videoCanvas") as HTMLCanvasElement;
    adjustParametersCanvas = document.getElementById("adjustParametersCanvas") as HTMLCanvasElement;
    binaryCheckCanvas = document.getElementById("binaryCheckCanvas") as HTMLCanvasElement;
    trajectoryCanvas = document.getElementById("trajectoryCanvas") as HTMLCanvasElement;
    storoboCanvas = document.getElementById("storoboCanvas") as HTMLCanvasElement;
    xtGraphCanvas = document.getElementById("xtGraphCanvas") as HTMLCanvasElement;

    videoInputTabButton = document.querySelector('button[data-bs-target="#videoInputTab"]');
    adjustParametersTabButton = document.querySelector('button[data-bs-target="#adjustParametersTab"]');
    motionAnalyzeTabButton = document.querySelector('button[data-bs-target="#motionAnalyzeTab"]');
    outputGraphTabButton = document.querySelector('button[data-bs-target="#outputGraphTab"]');
    debugTabButton = document.querySelector('button[data-bs-target="#debugTab"]');

    rangeThreshInput = document.getElementById("rangeThreshInput") as HTMLInputElement;
    checkThreshInput = document.getElementById("checkThreshInput") as HTMLInputElement;
    rangeThreshText = document.getElementById("rangeThreshText");

    ["Up", "Down", "Left", "Right"].forEach(str => {
        rangeInput[str] = document.getElementById(`range${str}Input`) as HTMLInputElement;
        rangeText[str] = document.getElementById(`range${str}Text`) as HTMLElement;
    });
    updateInputVideo();

    ["Up", "Down", "Left", "Right"].forEach(str => {
        rangeInput[str].addEventListener("input", (e) => {
            ["Up", "Down", "Left", "Right"].forEach(s => {
                rangeText[s].textContent = rangeInput[s].value.toString();
            });
            const x1 = Number.parseInt(rangeInput["Left"].value);
            const y1 = Number.parseInt(rangeInput["Up"].value);
            const x2 = Number.parseInt(rangeInput["Right"].value);
            const y2 = Number.parseInt(rangeInput["Down"].value);
            if (imageAnalyzer?.setRegion(x1, y1, x2, y2)) phase.reduceTo(Phase.VideoLoaded);

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


    /* tab event*/
    [videoInputTabButton, adjustParametersTabButton, motionAnalyzeTabButton /*,outputGraphTabButton */].forEach(button => {
        button.addEventListener("hide.bs.tab", (e) => AsyncCommand.subscribe(
            "HideTab", false,
            async (isChanceling) => { },
            () => { e.preventDefault() }
        ))
    });
    
    videoInputTabButton.addEventListener("shown.bs.tab", (e) => AsyncCommand.subscribe(
        "VideInputTabShown", false,
        async (isChanceling) => {
            imageAnalyzer?.p.videoElement.pause();
            imageAnalyzer?.setCurrentTimeAsync(0);
            updateInputVideo();
        }
    ));
    
    adjustParametersTabButton.addEventListener("shown.bs.tab", (e) => AsyncCommand.subscribe(
        "AdjustParametersTabShown", false,
        async (isChanceling) => {
            if (phase.lessThan(Phase.VideoLoaded)) {
                showErrorModal("まずは動画ファイルを選択してください。");
                bootstrap.Tab.getOrCreateInstance(videoInputTabButton).show();
            }
            else {
                const message = imageAnalyzer.validateVideoInput();
                if (message !== "") {
                    showErrorModal(message);
                    bootstrap.Tab.getOrCreateInstance(videoInputTabButton).show();
                }
                else if (phase.lessThan(Phase.ObjectMasked)) {
                    await updateCheckBackgroundAsync();
                }
            }
        }
    ));

    motionAnalyzeTabButton.addEventListener("shown.bs.tab", (e) => AsyncCommand.subscribe(
        "MotionAnalyzeTabShown", false,
        async (isChanceling) => {
            if (phase.lessThan(Phase.ObjectMasked)) {
                bootstrap.Tab.getOrCreateInstance(adjustParametersTabButton).show();
            }
            else if (phase.equalsTo(Phase.ObjectMasked)) {
                await updateMotionAnalyzeAsync();
            }
        }
    ));

    outputGraphTabButton.addEventListener("shown.bs.tab", (e) => AsyncCommand.subscribe(
        "outputGraphTabShown", false,
        async (isChanceling) => {
            if (phase.lessThan(Phase.MotionAnaized)) {
                bootstrap.Tab.getOrCreateInstance(motionAnalyzeTabButton).show();
            }
            else if (phase.equalsTo(Phase.MotionAnaized)) {
                await updateOutputGraphAsync();
            }
        }
    ));

    /* InputVideo event */
    selectedFile.addEventListener("change", () => AsyncCommand.subscribe(
        "inputVideoButtonClick", true,
        async (isChanceling) => {
            if (selectedFile.files.length > 0) {
                await loadVideoAsync(selectedFile.files[0]);
            }
        })
    );
    
    document.getElementById("startTimeSetButton").addEventListener("click", () => AsyncCommand.subscribe(
        "startTimeSetButtonClick", false,
        async (isChanceling) => {
            if (imageAnalyzer) {
                const changed = imageAnalyzer.setStartTime();
                if (changed) phase.reduceTo(Phase.VideoLoaded);
            }
            else {
                showErrorModal("動画ファイルが選択されていません");
            }
            updateInputVideo();
        })
    );

    document.getElementById("endTimeSetButton").addEventListener("click", () => AsyncCommand.subscribe(
        "endTimeSetButtonClick", false,
        async (isChanceling) => {
            if (imageAnalyzer) {
                const changed = imageAnalyzer.setEndTime();
                if (changed) phase.reduceTo(Phase.VideoLoaded);
            }
            else {
                showErrorModal("動画ファイルが選択されていません");
            }
            updateInputVideo();
        })
    );

    /* adjustParameters event */
    rangeThreshInput.addEventListener("change", (e) => AsyncCommand.subscribe(
        "rangeThreshInputChange", true,
        async (isChanceling) => {
            const value = rangeThreshInput.value;
            rangeThreshText.textContent = value
            const changed = imageAnalyzer.setThresh(parseInt(rangeThreshInput.value), checkThreshInput.checked);
            if (changed) {
                phase.reduceTo(Phase.BackgroundDetected);
                if (phase.equalsTo(Phase.BackgroundDetected)) {
                    await updateCheckBackgroundAsync();       
                }
            }
        })
    );

    checkThreshInput.addEventListener("change", (e) => AsyncCommand.subscribe(
        "checkThreshInputChange", true,
        async (isChanceling) => {
            const value = checkThreshInput.checked;
            rangeThreshInput.disabled = value;
            const changed = imageAnalyzer.setThresh(parseInt(rangeThreshInput.value), value);
            if (changed) {
                phase.reduceTo(Phase.BackgroundDetected);
                if (phase.equalsTo(Phase.BackgroundDetected)) {
                    await updateCheckBackgroundAsync();
                }
            }
        })
    );
    /* motionAnalyzeEvent */
    /* outputGraphEvent */
    document.getElementById("saveXcsvbutton").addEventListener("click", () => AsyncCommand.subscribe(
        "saveXcsvbuttonClick", false,
        async (isChanceling) => {
            if (phase.lessThan(Phase.MotionAnaized)) {
                showErrorModal("グラフが表示されるまで待ってください。");
            }
            else {
                imageAnalyzer.data.downloadCSVData();
            }
        })
    );
});

function updateInputVideo() {
    if (imageAnalyzer) {
        const p = imageAnalyzer.p;
        imageAnalyzer.updateSrcFromVideoCapture();
        document.getElementById("startTimeText").textContent = `${p.startTime.toFixed(2)} s`;
        document.getElementById("endTimeText").textContent = `${p.endTime.toFixed(2)} s`;
    
        rangeInput["Up"].max = p.targetHeight.toString();
        rangeInput["Down"].max = p.targetHeight.toString();
        rangeInput["Left"].max = p.targetWidth.toString();
        rangeInput["Right"].max = p.targetWidth.toString();
        rangeInput["Up"].value = p.region.y.toString();
        rangeInput["Down"].value = (p.region.y + p.region.height).toString();
        rangeInput["Left"].value = p.region.x.toString();
        rangeInput["Right"].value = (p.region.x + p.region.width).toString();
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

async function loadVideoAsync(file: File) {
    if (imageAnalyzer) {
        imageAnalyzer.dispose();
        imageAnalyzer = undefined;
        phase.changeTo(Phase.VideoNotLoaded);
    }
    updateInputVideo();
    const spinner = document.getElementById("videoInputSpinner");
    spinner.hidden = false;
    try {
        imageAnalyzer = await ImageAnalyzer.createAsync(videoInputVideo, file);
        await imageAnalyzer.setCurrentTimeAsync(0);
        phase.changeTo(Phase.VideoLoaded);
    }
    catch {
        showErrorModal("動画が正常に読み込めませんでした。");
        imageAnalyzer = undefined;
        phase.changeTo(Phase.VideoNotLoaded);
    }
    spinner.hidden = true;
    updateInputVideo();
}

async function updateCheckBackgroundAsync() {
    commonProgressbar.hidden = false;
    const barUpdate1 = (p: number) => commonProgressbar.style.width = (p * 80).toFixed() + "%";
    const barUpdate2 = (p: number) => commonProgressbar.style.width = (p * 20 + 80).toFixed() + "%";
    barUpdate1(0);

    checkThreshInput.checked = imageAnalyzer.p.autoThreshold;
    if (!checkThreshInput.checked) {
        rangeThreshText.textContent = imageAnalyzer.p.threshold.toString();
        rangeThreshInput.value = imageAnalyzer.p.threshold.toString();
    }

    if (phase.lessThan(Phase.BackgroundDetected)) {
        adjustParametersCanvas.getContext("2d").clearRect(0, 0, adjustParametersCanvas.width, adjustParametersCanvas.height);
        await imageAnalyzer.calcBackgroundAsync(barUpdate1).then(() => {
            cv.imshow(adjustParametersCanvas, imageAnalyzer.r.backRegionMat);
            phase.changeTo(Phase.BackgroundDetected);
        });
    }
    await imageAnalyzer.calcBinaryCheckMatAsync(barUpdate2).then(() => {
        if (checkThreshInput.checked) {
            rangeThreshText.textContent = imageAnalyzer.p.threshold.toString();
            rangeThreshInput.value = imageAnalyzer.p.threshold.toString();
        }
        binaryCheckCanvas.getContext("2d").clearRect(0, 0, binaryCheckCanvas.width, binaryCheckCanvas.height);
        cv.imshow(binaryCheckCanvas, imageAnalyzer.r.binaryCheckMat);
        phase.changeTo(Phase.ObjectMasked);
    });
    commonProgressbar.hidden = true;
}
async function updateMotionAnalyzeAsync() {
    commonProgressbar.hidden = false;
    const barUpdate = (p: number) => commonProgressbar.style.width = (p * 100).toFixed() + "%";
    barUpdate(0);

    storoboCanvas.getContext("2d").clearRect(0, 0, storoboCanvas.width, storoboCanvas.height);
    trajectoryCanvas.getContext("2d").clearRect(0, 0, trajectoryCanvas.width, trajectoryCanvas.height);

    await imageAnalyzer.calcMotionDataAsync(barUpdate).then(() => {
        cv.imshow(storoboCanvas, imageAnalyzer.r.storoboMat);
        cv.imshow(trajectoryCanvas, imageAnalyzer.r.trajectoryMat);
    }).then(() => {
        phase.changeTo(Phase.MotionAnaized);
        commonProgressbar.hidden = true;
    });
}

async function updateOutputGraphAsync() {
    commonProgressbar.hidden = false;
    imageAnalyzer.data.getChartX(xtGraphCanvas);
    commonProgressbar.hidden = true;
} 

function showErrorModal(str: string) {
    document.getElementById("modalErrorText").textContent = str;
    new bootstrap.Modal(document.getElementById("modalAlert")).show();
}

function runTest() {
    const canvases: HTMLCanvasElement[] = [];
    document.querySelectorAll(".testcanvas").forEach(e => canvases.push(<HTMLCanvasElement>e));
    imageAnalyzer.test(canvases);
}