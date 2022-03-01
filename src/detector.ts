import cv, { Mat, Scalar, Rect, MatVector, Point,Moments } from "../opencv-ts/src/opencv";
import { TrajParameter, Resource, DetectType, TXY, Circle, distance2, centerRect, offset} from "./utilities";

export class Detector{
    private cntColor = new cv.Scalar(128, 255, 0); 
    private srcRBGMat = new cv.Mat();
    private diffMat = new cv.Mat();
    private diffGrayMat1 = new cv.Mat();
    private diffGrayMat2 = new cv.Mat();
    private binaryMat1 = new cv.Mat();
    private kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3), new cv.Point(-1, -1));
    private contours = new cv.MatVector();
    private hierarchy = new cv.Mat();
    private threahList: number[] = [];
    lastDetectedPoint: Point = undefined;

    private dispos: Array<Mat|MatVector>; 
    
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
            case "Square":
                this.contoursAnalyzeFunc = this.contoursAnalyzeSquare;
                break;
            case "Big":
                this.contoursAnalyzeFunc = this.contoursAnalyzeBig;
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
            }
        }
        r.srcROI.copyTo(r.detectedROI);
        cv.rectangle(r.objectMask, new cv.Point(0, 0), new cv.Point(p.targetWidth, p.targetHeight), new cv.Scalar(0), cv.FILLED);

        if (countour) {
            const offX = p.region.x;
            const offY = p.region.y;
            const center = circle.center
            cv.line(r.detectedROI, new cv.Point(0, center.y), new cv.Point(p.region.width, center.y), this.cntColor, 1);
            cv.line(r.detectedROI, new cv.Point(center.x, 0), new cv.Point(center.x,p.region.height), this.cntColor, 1);
            cv.circle(r.detectedROI, center, circle.radius, this.cntColor, 1);
            cv.circle(r.objectMask, offset(center, offX, offY), circle.radius, new cv.Scalar(255), cv.FILLED);
            this.lastDetectedPoint = detectOnlyNear ? center : undefined;
            return [time, center.x + offX, center.y + offY];
        }
        else {
            this.lastDetectedPoint = undefined;
            return undefined;
        }
    }
    contoursAnalyzeSquare(p: TrajParameter, r: Resource, time: number, detectOnlyNear: boolean): TXY {
       let hiseihou = 10;
        let boundingRect: Rect;
        let countour: Mat;
        const radiusMinThresh = 10;
        const maxDistanceToDetect = 30;
        for (let i = 0; i < this.contours.size(); i++) {
            const cnt = this.contours.get(i);
            const area = cv.contourArea(cnt);
            const re = cv.boundingRect(cnt);
            const hi = Math.abs(re.width - re.height) / (re.width + re.height);
            let update = hi < hiseihou;
            update &&= radiusMinThresh < Math.min(re.width, re.height);
            if (detectOnlyNear && this.lastDetectedPoint) {
                update &&= distance2(this.lastDetectedPoint, centerRect(re)) < maxDistanceToDetect ** 2;
            }
            if (update) {
                hiseihou = hi;
                boundingRect = re;
                countour = cnt;
            }
        }
        r.srcROI.copyTo(r.detectedROI);
        cv.rectangle(r.objectMask, new cv.Point(0, 0), new cv.Point(p.targetWidth, p.targetHeight), new cv.Scalar(0), cv.FILLED);

        if (countour) {
            const offX = p.region.x;
            const offY = p.region.y;
            const center = centerRect(boundingRect);
            const p1 = new cv.Point(boundingRect.x, boundingRect.y);
            const p2 = offset(p1, boundingRect.width, boundingRect.height);
            cv.line(r.detectedROI, new cv.Point(0, center.y), new cv.Point(p.region.width, center.y), this.cntColor, 1);
            cv.line(r.detectedROI, new cv.Point(center.x, 0), new cv.Point(center.x, p.region.height), this.cntColor, 1);
            cv.rectangle(r.detectedROI, p1, p2, this.cntColor, 1);
            cv.rectangle(r.detectedBinaryROI, offset(p1, offX, offY), offset(p1, offX, offY), new cv.Scalar(255), cv.FILLED);
            this.lastDetectedPoint = detectOnlyNear ? center : undefined;
            return [time, center.x + offX, center.y + offY];
        }
        else {
            this.lastDetectedPoint = undefined;
            return undefined;
        }
    }
    contoursAnalyzeBig(p: TrajParameter, r: Resource, time: number, detectOnlyNear: boolean): TXY {
        let index = 0;
        let moment: Moments;
        let area = 0;
        let countour: Mat;
        const radiusMinThresh = 5;
        const maxDistanceToDetect = 30;
        for (let i = 0; i < this.contours.size(); i++) {
            const cnt = this.contours.get(i);
            const mo = cv.moments(cnt);
            const ar = mo.m00;
            let update = mo.m00 > area;
            update &&= radiusMinThresh * radiusMinThresh < ar;
            if (detectOnlyNear && this.lastDetectedPoint) {
                update &&= distance2(this.lastDetectedPoint, new cv.Point(mo.m10 / ar, mo.m01 / ar)) < maxDistanceToDetect ** 2;
            }
            if (update) {
                moment = mo;
                area = ar;
                countour = cnt;
                index = i;
            }
        }
        r.srcROI.copyTo(r.detectedROI);
        cv.rectangle(r.objectMask, new cv.Point(0, 0), new cv.Point(p.targetWidth, p.targetHeight), new cv.Scalar(0), cv.FILLED);

        if (countour) {
            const offX = p.region.x;
            const offY = p.region.y;
            const center = new cv.Point(moment.m10 / area, moment.m01 / area);
            cv.line(r.detectedROI, new cv.Point(0, center.y), new cv.Point(p.region.width, center.y), this.cntColor, 1);
            cv.line(r.detectedROI, new cv.Point(center.x, 0), new cv.Point(center.x, p.region.height), this.cntColor, 1);
            cv.drawContours(r.detectedROI, this.contours, index, this.cntColor, 1);
            cv.drawContours(r.detectedBinaryROI, this.contours, index, new cv.Scalar(255), cv.FILLED, cv.LINE_8, this.hierarchy, 1, new cv.Point(offX, offY));
            this.lastDetectedPoint = detectOnlyNear ? center : undefined;
            return [time, center.x + offX, center.y + offY];
        }
        else {
            this.lastDetectedPoint = undefined;
            return undefined;
        }
    }
}
