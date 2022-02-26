import { CovarFlags } from "../opencv-ts/src/core/Core";
import cv, { Mat, opencv, Scalar, Rect, MatVector, Point } from "../opencv-ts/src/opencv";
import { TrajParameter, Resource, offset,TXY ,Circle, distance2} from "./utilities";

export type DetectType = "Circle" | "Big";

export class Detector{
    cntColor = new cv.Scalar(128, 255, 0); 
    srcRBGMat = new cv.Mat();
    diffMat = new cv.Mat();
    diffGrayMat1 = new cv.Mat();
    diffGrayMat2 = new cv.Mat();
    binaryMat1 = new cv.Mat();
    kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3), new cv.Point(-1, -1));
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    private threahList: number[] = [];
    lastDetectedPoint: Point = undefined;

    protected dispos: Array<Mat|MatVector>; 
    
    constructor() {
        this.setDetectType("Circle");
        this.dispos = [
            this.srcRBGMat,
            this.diffMat,
            this.diffGrayMat1,
            this.diffGrayMat2,
            this.binaryMat1,
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
    
    detectOne(p: TrajParameter, r: Resource, time: number, detectOnlyNear: boolean) : TXY {
        cv.cvtColor(r.srcMat, this.srcRBGMat, cv.COLOR_BGRA2BGR);
        r.srcROI = this.srcRBGMat.roi(p.region);
        cv.absdiff(r.srcROI, r.backRegionROI, this.diffMat);
        cv.cvtColor(this.diffMat, this.diffGrayMat1, cv.COLOR_BGR2GRAY);
        cv.GaussianBlur(this.diffGrayMat1, this.diffGrayMat2, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
        if (p.autoThreshold) {
            this.threahList.push(<number><unknown>cv.threshold(this.diffGrayMat2, this.binaryMat1, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU));
        }
        else {
            cv.threshold(this.diffGrayMat2, this.binaryMat1, p.threshold, 255, cv.THRESH_BINARY);
        }
        cv.morphologyEx(this.binaryMat1, r.detectedBinaryROI, cv.MORPH_OPEN, this.kernel, new cv.Point(-1, -1), 2, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());
        cv.findContours(r.detectedBinaryROI, this.contours, this.hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);
        return this.contoursAnalyzeFunc(p, r, time, detectOnlyNear);
    }

    contoursAnalyzeFunc: (p: TrajParameter, r: Resource, time: number, detectOnlyNear: boolean) => TXY;
    contoursAnalyzeCircle(p: TrajParameter, r: Resource, time: number, detectOnlyNear: boolean): TXY {
        let index = 0;
        let enkei = 0;
        let circle: Circle;
        let countour: Mat;
        const radiusMinThresh = 5;
        const maxDistanceToDetect = 30;
        for (let i = 0; i < this.contours.size(); i++) {
            const cnt = this.contours.get(i);
            const length = cv.arcLength(cnt, true);
            const area = cv.contourArea(cnt);
            const en = 4 * Math.PI * area / length ** 2;
            const ci = <Circle><unknown>cv.minEnclosingCircle(cnt);
            let update = en > enkei;
            update &&= radiusMinThresh < ci.radius;
            if (detectOnlyNear && this.lastDetectedPoint) {
                update &&= distance2(this.lastDetectedPoint, ci.center) < maxDistanceToDetect ** 2;
            }
            if (update) {
                enkei = en;
                circle = ci;
                countour = cnt;
                index = i;
            }
        }
        r.srcROI.copyTo(r.detectedROI);
        cv.rectangle(r.objectMask, new cv.Point(0, 0), new cv.Point(p.targetWidth, p.targetHeight), new cv.Scalar(0), cv.FILLED);

        if (countour) {
            const offX = p.region.x;
            const offY = p.region.y;
           
            /*
            const rect = cv.boundingRect(countour);
            cv.rectangle(this.outputMat,
                new cv.Point(rect.x + offX, rect.y + offY),
                new cv.Point(rect.x + offX + rect.width, rect.y + offY + rect.height),
                this.cntColor, 3);
            cv.drawContours(this.outputMat, this.contours, index,
                new cv.Scalar(0, 255, 0),
                cv.FILLED, cv.LINE_8,
                this.hierarchy, 1, new cv.Point(offX, offY));
            */
            cv.line(r.detectedROI, new cv.Point(0, circle.center.y), new cv.Point(p.region.width, circle.center.y), this.cntColor, 1);
            cv.line(r.detectedROI, new cv.Point(circle.center.x, 0), new cv.Point(circle.center.x,p.region.height), this.cntColor, 1);
            cv.circle(r.detectedROI, circle.center, circle.radius, this.cntColor, 1);
            cv.circle(r.objectMask, offset(circle.center, offX, offY), circle.radius, new cv.Scalar(255), cv.FILLED);
            this.lastDetectedPoint = detectOnlyNear ? circle.center : undefined;
            return [time, circle.center.x + offX, circle.center.y + offY];
        }
        else {
            this.lastDetectedPoint = undefined;
            return undefined;
        }
    }
}
