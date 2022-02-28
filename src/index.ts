import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import * as bootstrap from "bootstrap";
import { ImageAnalyzer } from "./imageAnalyzer";
import { MAX_PICTURE_SIZE, DetectType} from "./utilities";
import cv, { Mat, Rect} from "../opencv-ts/src/opencv";



let imageAnalyzer: ImageAnalyzer;

let commonProgressbar: HTMLElement;
let selectedFile: HTMLInputElement;
let videoInputVideo: HTMLVideoElement;
let videoCanvas: HTMLCanvasElement;
let adjustParametersBackCanvas: HTMLCanvasElement;
let adjustParametersSrcCanvas: HTMLCanvasElement;
let adjustParametersMaskCanvas: HTMLCanvasElement;
let adjustParametersDetectedCanvas: HTMLCanvasElement;
let storoboCanvas: HTMLCanvasElement;
let trajectoryCanvas: HTMLCanvasElement;
let xtGraphCanvas: HTMLCanvasElement;
let vtGraphCanvas: HTMLCanvasElement;

let videoInputTabButton: HTMLButtonElement;
let adjustParametersTabButton: HTMLButtonElement;
let motionAnalyzeTabButton: HTMLButtonElement;
let outputGraphTabButton: HTMLButtonElement;

let rangeThreshInput: HTMLInputElement;
let checkThreshInput:HTMLInputElement;
let rangeThreshText: HTMLElement;
let rangeCurrentTimeInput: HTMLInputElement;
let rangeCurrentTimeText: HTMLElement;

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

window.addEventListener('DOMContentLoaded', () => { 
    commonProgressbar = document.getElementById("commonProgressbar");
    selectedFile = document.getElementById("selectedFile") as HTMLInputElement;
    videoInputVideo = document.getElementById("videoInput") as HTMLVideoElement;
    videoCanvas = document.getElementById("videoCanvas") as HTMLCanvasElement;
    adjustParametersBackCanvas = document.getElementById("adjustParametersBackCanvas") as HTMLCanvasElement;
    adjustParametersSrcCanvas = document.getElementById("adjustParametersSrcCanvas") as HTMLCanvasElement;
    adjustParametersMaskCanvas = document.getElementById("adjustParametersMaskCanvas") as HTMLCanvasElement;
    adjustParametersDetectedCanvas = document.getElementById("adjustParametersDetectedCanvas") as HTMLCanvasElement;
    trajectoryCanvas = document.getElementById("trajectoryCanvas") as HTMLCanvasElement;
    storoboCanvas = document.getElementById("storoboCanvas") as HTMLCanvasElement;
    xtGraphCanvas = document.getElementById("xtGraphCanvas") as HTMLCanvasElement;
    vtGraphCanvas = document.getElementById("vtGraphCanvas") as HTMLCanvasElement;

    videoInputTabButton = document.querySelector('button[data-bs-target="#videoInputTab"]');
    adjustParametersTabButton = document.querySelector('button[data-bs-target="#adjustParametersTab"]');
    motionAnalyzeTabButton = document.querySelector('button[data-bs-target="#motionAnalyzeTab"]');
    outputGraphTabButton = document.querySelector('button[data-bs-target="#outputGraphTab"]');

    rangeThreshInput = document.getElementById("rangeThreshInput") as HTMLInputElement;
    checkThreshInput = document.getElementById("checkThreshInput") as HTMLInputElement;
    rangeThreshText = document.getElementById("rangeThreshText");
    rangeCurrentTimeInput = document.getElementById("rangeCurrentTimeInput") as HTMLInputElement;
    rangeCurrentTimeText = document.getElementById("rangeCurrentTimeText");
   
    ["Up", "Down", "Left", "Right"].forEach(str => {
        rangeInput[str] = document.getElementById(`range${str}Input`) as HTMLInputElement;
        rangeText[str] = document.getElementById(`range${str}Text`) as HTMLElement;
    });
    document.getElementById("page").hidden = false;
    document.getElementById("loading-wrapper").hidden = true;
});
window.addEventListener('load', () => {
    document.documentElement.style.setProperty("--max-picture-size", `${MAX_PICTURE_SIZE}px`);
    phase.changeTo(Phase.VideoNotLoaded);
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
            await imageAnalyzer?.setCurrentTimeAsync(0);
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
                    await updateAdjustParametersAsync();
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
    
    ["startTimeSetButton", "endTimeSetButton", "startTimeClearButton", "endTimeClearButton"].forEach(id => { 
        document.getElementById(id).addEventListener("click", () => AsyncCommand.subscribe(
            id+"Click", false,
            async (isChanceling) => {
                if (imageAnalyzer) {
                    let changed: boolean;
                    switch (id) {
                        case "startTimeSetButton": changed = imageAnalyzer.setStartTime(false); break;
                        case "endTimeSetButton": changed = imageAnalyzer.setEndTime(false); break;
                        case "startTimeClearButton": changed = imageAnalyzer.setStartTime(true); break;
                        case "endTimeClearButton": changed = imageAnalyzer.setEndTime(true); break;
                    }
                    if (changed) phase.reduceTo(Phase.VideoLoaded);
                }
                else {
                    showErrorModal("動画ファイルが選択されていません");
                }
                updateInputVideo();
            })
        );

    });

    /* adjustParameters event */
    rangeThreshInput.addEventListener("change", (e) => AsyncCommand.subscribe(
        "rangeThreshInputChange", true,
        async (isChanceling) => {
            const value = rangeThreshInput.value;
            rangeThreshText.textContent = value
            const changed = imageAnalyzer.setThresh(parseInt(value), checkThreshInput.checked);
            if (changed) {
                phase.reduceTo(Phase.BackgroundDetected);
                if (phase.equalsTo(Phase.BackgroundDetected)) {
                    await updateAdjustParametersAsync();       
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
                    await updateAdjustParametersAsync();
                }
            }
        })
    );

    rangeCurrentTimeInput.addEventListener("change", (e) => AsyncCommand.subscribe(
        "rangeCurrentTimeInputChange", false,
        async (isChanceling) => {
            const value = parseFloat(rangeCurrentTimeInput.value);
            rangeCurrentTimeText.textContent = `${value.toFixed(2)} s`;
            const changed = await imageAnalyzer.setCurrentTimeAsync(value);
            if (changed) {
                phase.reduceTo(Phase.BackgroundDetected);
                if (phase.equalsTo(Phase.BackgroundDetected)) {
                    await updateAdjustParametersAsync();
                }
            }
        })
    );

    (["Circle", "Square", "Big"] as DetectType[]).forEach(str => { 
        document.getElementById("adjustParameterButton" + str).addEventListener("click", (e) => AsyncCommand.subscribe(
            "adjustParameterButton" + str + "Click", false,
            async (isChanceling) => { 
                phase.reduceTo(Phase.BackgroundDetected);
                if (phase.equalsTo(Phase.BackgroundDetected)) {
                    imageAnalyzer.setDetectType(str);
                    await updateAdjustParametersAsync();
                }
            }
        ))
    });
    /* motionAnalyzeEvent */
    /* outputGraphEvent */
    ["X", "V"].forEach(str => { 
        document.getElementById(`save${str}csvbutton`).addEventListener("click", () => AsyncCommand.subscribe(
            `save${str}csvbuttonClick`, false,
            async (isChanceling) => {
                if (phase.lessThan(Phase.MotionAnaized)) {
                    showErrorModal("グラフが表示されるまで待ってください。");
                }
                else {
                    imageAnalyzer.data.downloadCSVData(str);
                }
            })
        );

    });
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
    document.getElementById("videoInputAccordion").hidden = hideVideInputContent;
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
        if (imageAnalyzer) imageAnalyzer.dispose();
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

async function updateAdjustParametersAsync() {
    commonProgressbar.hidden = false;
    const time = imageAnalyzer.p.videoElement.currentTime;
    rangeCurrentTimeInput.min = imageAnalyzer.p.startTime.toString();
    rangeCurrentTimeInput.max = imageAnalyzer.p.endTime.toString();
    const barUpdate = (p: number) => commonProgressbar.style.width = (p*100).toFixed() + "%";
    barUpdate(0);

    checkThreshInput.checked = imageAnalyzer.p.autoThreshold;
    if (!checkThreshInput.checked) {
        rangeThreshText.textContent = imageAnalyzer.p.threshold.toString();
        rangeThreshInput.value = imageAnalyzer.p.threshold.toString();
    }

    if (phase.lessThan(Phase.BackgroundDetected)) {
        await imageAnalyzer.calcBackgroundAsync(barUpdate).then(() => {
            cv.imshow(adjustParametersBackCanvas, imageAnalyzer.r.backRegionROI);
            phase.changeTo(Phase.BackgroundDetected);
        });
    }
    await imageAnalyzer.calcBinaryCheckMatAsync(time).then(() => {
        if (checkThreshInput.checked) {
            rangeThreshText.textContent = imageAnalyzer.p.threshold.toString();
            rangeThreshInput.value = imageAnalyzer.p.threshold.toString();
        }
        rangeCurrentTimeText.textContent = `${time.toFixed(2)} s`;
        rangeCurrentTimeInput.value = time.toFixed(2);

        cv.imshow(adjustParametersSrcCanvas, imageAnalyzer.r.srcROI);
        cv.imshow(adjustParametersMaskCanvas, imageAnalyzer.r.detectedBinaryROI);
        cv.imshow(adjustParametersDetectedCanvas, imageAnalyzer.r.detectedROI);
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
    imageAnalyzer.data.plotCharts(xtGraphCanvas, vtGraphCanvas);
    commonProgressbar.hidden = true;
} 

function showErrorModal(str: string) {
    document.getElementById("modalErrorText").textContent = str;
    new bootstrap.Modal(document.getElementById("modalAlert")).show();
}
