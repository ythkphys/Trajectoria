import cv, { Mat, Rect, Point, opencv} from "../opencv-ts/src/opencv";

export const MAX_PICTURE_SIZE = 640;
export const NUMBER_OF_MAT_FOR_BACKGROUND = 7;

export const Offset = (p: Point, offx: number, offy: number) => new cv.Point(p.x + offx, p.y + offy);

export type Circle = {
    center: Point,
    radius: number,
}

export type Status = "Idling" | "Processing" | "Canceling";

export type TrajParameter = {
    videoElement: HTMLVideoElement;
    status: Status;         // 計算中かどうかのフラグ
    videoDuration?: number; // 動画の長さ
    trueWidth?: number;     // 動画の元の幅
    trueHeight?: number;    // 動画の元の高さ
    targetWidth?: number;   // 解析画像の幅
    targetHeight?: number;  // 解析画像の高さ
    startTime?: number;     // 解析範囲(時間)の始まり
    endTime?: number;       // 解析範囲(時間)の終わり
    region?: Rect;          // 解析範囲(空間)
}

export type Resource = {
    cap?: opencv.VideoCapture;
    srcMat?: Mat;
    backRegionMat?: Mat;
    binaryCheckMat?: Mat;
    objectMask?: Mat;
    storoboMat?: Mat;
    trajectoryMat?: Mat;
};

export type TXY = {
    t: number,
    x: number,
    y: number
};
