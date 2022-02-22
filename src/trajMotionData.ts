import {TXY} from "./utilities";

export class TrajMotionData{
    rawdata: TXY[] = [];

    addTXY(txy:TXY) {
        if(txy)this.rawdata.push(txy);
    }
}