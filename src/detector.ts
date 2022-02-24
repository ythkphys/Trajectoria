import cv, { Mat, opencv, Scalar, Rect, MatVector } from "../opencv-ts/src/opencv";
import { TrajParameter, Resource, Offset,TXY ,Circle} from "./utilities";

export type DetectType = "Circle" | "Big";

export class Detector{
    cntColor = new cv.Scalar(255, 0, 0); 
    srcRegionMat = new cv.Mat();
    outputMat = new cv.Mat();
    diffMat = new cv.Mat();
    diffGrayMat1 = new cv.Mat();
    diffGrayMat2 = new cv.Mat();
    binaryMat1 = new cv.Mat();
    binaryMat2 = new cv.Mat();
    kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3), new cv.Point(-1, -1));
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    threahList: number[] = [];

    protected dispos: Array<Mat|MatVector>; 
    
    constructor() {
        this.setDetectType("Circle");
        this.dispos = [
            this.srcRegionMat,
            this.outputMat,
            this.diffMat,
            this.diffGrayMat1,
            this.diffGrayMat2,
            this.binaryMat1,
            this.binaryMat2,
            this.kernel,
            this.hierarchy,
            this.contours,
        ];
    }
    
    setDetectType(type:DetectType) {
        switch (type) {
            case "Circle":
                this.contoursAnalyzeFunc = this.contoursAnalyzeCircle;
                break;
            default:
                throw new Error();
        }
    }
    resetThreshList() {
        this.threahList = [];
    }
    getAvgThresh() { 
        const sum = this.threahList.reduce((a, b) => a + b);
        return Math.round(sum / this.threahList.length);
    }

    dispose() {
        this.dispos.forEach(mat => mat?.delete());
    }
    
    detectOne(p: TrajParameter, r: Resource, time: number) : TXY {
        cv.cvtColor(r.srcMat, this.outputMat, cv.COLOR_BGRA2BGR);
        this.srcRegionMat = this.outputMat.roi(p.region);
        cv.absdiff(this.srcRegionMat, r.backRegionMat, this.diffMat);
        cv.cvtColor(this.diffMat, this.diffGrayMat1, cv.COLOR_BGR2GRAY);
        cv.GaussianBlur(this.diffGrayMat1, this.diffGrayMat2, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
        if (p.autoThreshold) {
            this.threahList.push(<number><unknown>cv.threshold(this.diffGrayMat2, this.binaryMat1, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU));
        }
        else {
            cv.threshold(this.diffGrayMat2, this.binaryMat1, p.threshold, 255, cv.THRESH_BINARY);
        }
        cv.morphologyEx(this.binaryMat1, this.binaryMat2, cv.MORPH_OPEN, this.kernel, new cv.Point(-1, -1), 2, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());
        cv.findContours(this.binaryMat2, this.contours, this.hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);
        return this.contoursAnalyzeFunc(p, r, time);
    }

    contoursAnalyzeFunc: (p: TrajParameter, r: Resource, time: number) => TXY;
    contoursAnalyzeCircle (p: TrajParameter, r: Resource, time:number): TXY {
        let index = 0;
        let enkei = 0;
        let circle: Circle;
        let countour: Mat;
        const radiusThresh = 5;
        for (let i = 0; i < this.contours.size(); i++) {
            const cnt = this.contours.get(i);
            const length = cv.arcLength(cnt, true);
            const area = cv.contourArea(cnt);
            const en = 4 * Math.PI * area / length ** 2;
            const ci = <Circle><unknown>cv.minEnclosingCircle(cnt);
            if (en > enkei && radiusThresh < ci.radius) {
                enkei = en;
                circle = ci;
                countour = cnt;
                index = i;
            }
        }
        if (countour) {
            const offX = p.region.x;
            const offY = p.region.y;
            const rect = cv.boundingRect(countour);
            /*
            cv.rectangle(this.outputMat,
                new cv.Point(rect.x + offX, rect.y + offY),
                new cv.Point(rect.x + offX + rect.width, rect.y + offY + rect.height),
                this.cntColor, 3);
            cv.drawContours(this.outputMat, this.contours, index,
                new cv.Scalar(0, 255, 0),
                cv.FILLED, cv.LINE_8,
                this.hierarchy, 1, new cv.Point(offX, offY));
            //*/
            cv.rectangle(r.objectMask, new cv.Point(0, 0), new cv.Point(p.targetWidth, p.targetHeight), new cv.Scalar(0), cv.FILLED);
            cv.circle(r.objectMask, Offset(circle.center, offX, offY), circle.radius, new cv.Scalar(255), cv.FILLED);

            return [time, circle.center.x + offX, circle.center.y + offY];
        }
        else {
            return undefined;
        }
    }
}
