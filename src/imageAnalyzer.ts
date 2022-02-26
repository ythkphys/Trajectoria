import cv, { Mat, opencv ,Point} from "../opencv-ts/src/opencv";
import { TrajParameter, Resource, DetectType, debugMsg, NUMBER_OF_MAT_FOR_BACKGROUND, MAX_PICTURE_SIZE} from "./utilities";
import { Detector} from "./detector";
import { TrajMotionData } from "./trajMotionData";

export class ImageAnalyzer {
    p: TrajParameter;
    r: Resource;
    data: TrajMotionData
    detector: Detector;

    private constructor(video: HTMLVideoElement) {
        this.p = { videoElement: video, threshold:5, autoThreshold:true};
        this.r = {};
        this.data = new TrajMotionData(); 
        this.detector = new Detector();
        
        const p = this.p;
        p.trueWidth  = video.videoWidth;
        p.trueHeight = video.videoHeight;
        const dia = (() =>{
            if (Math.max(p.trueHeight, p.trueWidth) <= MAX_PICTURE_SIZE)// 小さい
                return 1;
            else if (p.trueHeight < p.trueWidth)//横長
                return  MAX_PICTURE_SIZE / p.trueWidth
            else
                return  MAX_PICTURE_SIZE / p.trueHeight;
        })();
        p.targetWidth = Math.floor(p.trueWidth * dia);
        p.targetHeight = Math.floor(p.trueHeight * dia);
        p.videoDuration = video.duration;
        p.startTime = 0;
        p.endTime = p.videoDuration;
        p.region = new cv.Rect(0, 0, p.targetWidth, p.targetHeight);

        const r = this.r;
        r.cap = null;
        r.srcMat = new cv.Mat(p.targetHeight, p.targetWidth, cv.CV_8UC4);
        r.backRegionROI = new cv.Mat();
        r.detectedBinaryROI = new cv.Mat();
        r.detectedROI = new cv.Mat();
        r.storoboMat = new cv.Mat();
        r.trajectoryMat = new cv.Mat();
        r.objectMask = new cv.Mat(p.targetHeight, p.targetWidth, cv.CV_8UC1);

        video.height = p.targetHeight;
        video.width = p.targetWidth;
    }

    static createAsync(videoElement: HTMLVideoElement, filename: File): Promise<ImageAnalyzer>{
        return new Promise((resolve, reject) => {
            let resolved = false;
            videoElement.addEventListener(
                "canplay", () => {
                    if (!resolved) {
                        resolved = true;
                        debugMsg("videoElement : canplay");
                        resolve(new ImageAnalyzer(videoElement));
                    }
                }, { once: true }
            );
            videoElement.addEventListener(
                "error", (e) => {
                    debugMsg("videoElement : error");
                    URL.revokeObjectURL(videoElement.src);
                    reject(undefined);
                }
            );
            videoElement.src = URL.createObjectURL(filename);
            videoElement.load();
        });
    }

    dispose() {
        this.r.srcMat?.delete();
        this.r.backRegionROI?.delete();
        this.r.detectedBinaryROI?.delete();
        this.r.detectedROI?.delete();
        this.r.storoboMat?.delete();
        this.r.trajectoryMat?.delete();
        this.r.objectMask?.delete();
        this.detector.dispose();
    }

    getTime(start: number, end: number, i: number) {
        return start + (end - start) / (NUMBER_OF_MAT_FOR_BACKGROUND - 1) * i;
    }

    setCurrentTimeAsync(time: number) :Promise<boolean>{
        if (this.p.videoElement.currentTime === time) {
            return Promise.resolve(false);
        }
        else {
            return new Promise(resolve => {
                this.p.videoElement.addEventListener("seeked", ()=>resolve(true), { once: true });
                this.p.videoElement.currentTime = time;
            });
        }
    }

    updateSrcFromVideoCapture(){
        if(this.r.cap==null) this.r.cap = new cv.VideoCapture(this.p.videoElement);
        this.r.cap.read(this.r.srcMat); 
    }
    
    setStartTime(reset:boolean) {
        const oldtime = this.p.startTime;
        this.p.startTime = reset ? 0: this.p.videoElement.currentTime;
        return this.p.startTime !== oldtime;
    }

    setEndTime(reset: boolean){
        const oldtime = this.p.endTime;
        this.p.endTime = reset ? this.p.videoElement.duration : this.p.videoElement.currentTime;
        return this.p.endTime !== oldtime;
    }

    setRegion(x1: number, y1: number, x2: number, y2: number) {
        const oldRect = new cv.Rect(this.p.region);
        this.p.region.x = Math.min(x1, x2);
        this.p.region.y = Math.min(y1, y2);
        this.p.region.width = Math.abs(x1 - x2);
        this.p.region.height = Math.abs(y1 - y2);
        return (oldRect === undefined)
            ||(this.p.region.x !== oldRect.x)
            || (this.p.region.x !== oldRect.y)
            || (this.p.region.width !== oldRect.width)
            || (this.p.region.height !== oldRect.height);
    }

    setThresh(thresh:number, auto:boolean) {
        const oldThresh = this.p.threshold;
        const oldAuto = this.p.autoThreshold;
        this.p.threshold = thresh;
        this.p.autoThreshold = auto;
        return (this.p.threshold !== oldThresh) || (this.p.autoThreshold !== oldAuto);
    }

    setDetectType(detectType: DetectType) {
        this.detector.setDetectType(detectType);
    }

    validateVideoInput(): string{
        if (this.r.cap == null) return "ビデオが正しく読み込まれていません。";
        else if (this.p.startTime >= this.p.endTime) return "「開始」は「終了」よりも小さい必要があります。"; 
        else return "";
    }

    async calcBackgroundAsync(barUpdate: (percent: number) => void) {
        const p = this.p;
        const r = this.r;
       
        const sourceNhalf = Math.floor(NUMBER_OF_MAT_FOR_BACKGROUND/ 2);
        const sourceMat: Array<Mat> = [];
        const sourceData: Array<any[]> = [];

        const currentTime = p.videoElement.currentTime;
        for (let i = 0; i < NUMBER_OF_MAT_FOR_BACKGROUND; i++) {
            barUpdate((i + 1) / NUMBER_OF_MAT_FOR_BACKGROUND*0.5);
            await this.setCurrentTimeAsync(this.getTime(p.endTime, p.startTime, i));
            r.cap.read(r.srcMat);
            const mat = new cv.Mat();
            cv.cvtColor(r.srcMat, mat, cv.COLOR_BGRA2BGR);
            sourceMat.push(mat);
            sourceData.push(mat.data);
        }
        p.videoElement.currentTime = currentTime;
        const backRegion = new cv.Mat(p.region.height, p.region.width, cv.CV_8UC3);
        const bdata = backRegion.data;
        const ymin = p.region.y;
        const ymax = ymin + p.region.height;
        const xmin = p.region.x;
        const xmax = xmin + p.region.width;
        const w = p.targetWidth;
        for (let y = ymin; y < ymax; y++) {
            barUpdate((y - ymin) / (ymax - ymin)*0.5+0.5); 
            for (let x = xmin; x < xmax; x++) {
                const n3 = (y * w + x ) * 3;
                const m3 = ( (y-ymin) * p.region.width + x-xmin) * 3;
                const obj = sourceData.map(sdata => {
                    const r = sdata[n3 + 0];
                    const g = sdata[n3 + 1];
                    const b = sdata[n3 + 2];
                    return [r, g, b, 0.30 * r + 0.59 * g + 0.11 * b];
                });
                obj.sort((o1, o2) => o1[3] > o2[3] ? 1 : -1);
                const objMedian = obj[sourceNhalf];
                bdata[m3 + 0] = objMedian[0];
                bdata[m3 + 1] = objMedian[1];
                bdata[m3 + 2] = objMedian[2];
            }
        }
        backRegion.copyTo(r.backRegionROI);
        backRegion.delete();
        sourceMat.forEach(mat => mat.delete());
        this.detector.resetThreshList();
    }
    async calcBinaryCheckMatAsync(time:number) {
        const [p, r] = [this.p, this.r];
        await this.setCurrentTimeAsync(time);
        r.cap.read(r.srcMat);
        const _ = this.detector.detectOne(p, r, time, false);
       if (this.p.autoThreshold) this.p.threshold = this.detector.getAvgThresh();
    }

    async calcMotionDataAsync(barUpdate: (percent:number) => void) {
        const [p, r, data] = [this.p, this.r, this.data];
        const N = 100;
        let p1: Point;
        let p2: Point;

        let needInit = true;
        let storoboCnt = 0;
        this.detector.lastDetectedPoint = undefined;
        const storoboMax = Math.floor(N / 10);
        data.targetH = p.targetHeight;
        for (let i = 0; i < N; i++,storoboCnt++) {
            barUpdate(i / (N-1));
            const time = p.startTime + (p.endTime - p.startTime) * i / (N - 1);
            await this.setCurrentTimeAsync(time);
            r.cap.read(r.srcMat);
            const txy = this.detector.detectOne(p, r, time, true);
            if (txy) {
                const [t, x, y] = txy;
                data.addTXY(txy);
                if (needInit) {
                    r.srcMat.copyTo(r.trajectoryMat);
                    r.srcMat.copyTo(r.storoboMat);
                    p2 = new cv.Point(x, y);
                    needInit = false;
                }
                else {
                    p1 = p2;
                    p2 = new cv.Point(x, y);
                    cv.line(r.trajectoryMat, p1, p2, new cv.Scalar(255, 0, 255, 255),3);
                    if (storoboCnt >= storoboMax) {
                        storoboCnt = 0;
                        r.srcMat.copyTo(r.storoboMat, r.objectMask);
                    }
                }
            }
        }
    }
}
