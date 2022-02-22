declare module Moments {
    interface Moments {
        new(): Moments;
        m00: number;
        m01: number;
        m02: number;
        m03: number;
        m10: number;
        m11: number;
        m12: number;
        m20: number;
        m21: number;
        m30: number;
        mu02: number;
        mu03: number;
        mu11: number;
        mu12: number;
        mu20: number;
        mu21: number;
        mu30: number;
        nu02: number;
        nu03: number;
        nu11: number;
        nu12: number;
        nu20: number;
        nu21: number;
        nu30: number;
    }
}

export = Moments;