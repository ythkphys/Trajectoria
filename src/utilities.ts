import cv, { Mat, Rect, Point, Scalar, opencv} from "../opencv-ts/src/opencv";

export const MAX_PICTURE_SIZE = 640;
export const NUMBER_OF_MAT_FOR_BACKGROUND = 5;

export const offset = (p: Point, offx: number, offy: number) => new cv.Point(p.x + offx, p.y + offy);
export const distance2 = (p1: Point, p2: Point) => (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
export const centerRect = (r: Rect) => new cv.Point(r.x+r.width/2 , r.y+r.height/2);
export const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(x, max));
    
export type Circle = {
    center: Point,
    radius: number,
}
export type DetectType = "Circle" | "Square" | "Big";

export type TrajParameter = {
    videoElement: HTMLVideoElement;
    videoDuration?: number; // 動画の長さ
    trueWidth?: number;     // 動画の元の幅
    trueHeight?: number;    // 動画の元の高さ
    targetWidth?: number;   // 解析画像の幅
    targetHeight?: number;  // 解析画像の高さ
    startTime?: number;     // 解析範囲(時間)の始まり
    endTime?: number;       // 解析範囲(時間)の終わり
    region?: Rect;          // 解析範囲(空間)
    threshold: number;     // 二値化の際の閾値
    autoThreshold: boolean;// Otsuを使うかどうか
    storoboNumber: number;    // ストロボ表示する回数
    trajectoryNumber: number; // 軌跡を描くための計算回数
    radiusMinThresh: number;    //検出の最小サイズ
    maxDistanceToDetect: number;//検出する近傍
}

export type Resource = {
    cap?: opencv.VideoCapture;
    srcMat?: Mat;           // 動画から読み込んだもの
    srcROI?: Mat;           // 動画から読み込んだもの：ROI
    backRegionROI?: Mat;    // 検出した背景：ROI
    detectedBinaryROI?: Mat;// 輪郭抽出前の2値化画像：ROI
    detectedROI?: Mat;      // 検出物体を強調した画像:ROI
    objectMask?: Mat;       // 検出した輪郭をもとに作ったマスク
    storoboMat?: Mat;       // ストロボ画像
    trajectoryMat?: Mat;    // 軌跡を描いた画像
};

export type TXY = [number,number,number];

export const Color = {
    ROI_CSS: "#40ff80",
    MaskBlack: new cv.Scalar(0),
    MaskWhite: new cv.Scalar(255),
    Object: new cv.Scalar(255, 40, 40, 255),
    Trajectory: new cv.Scalar(255, 128, 0, 255),
} as const;

export function debugMsg(message: any) {
    console.log(message);
}
