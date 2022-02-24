import {TXY} from "./utilities";

type XY = { x: number, y: number };
export class TrajMotionData{
    targetH: number;
    readonly plotdata: TXY[] = [];

    addTXY([rawt,rawx,rawy]:TXY) {
        this.plotdata.push([rawt, rawx, this.targetH-rawy]);
    }

    getGraphDataX(): XY[] { 
        return this.plotdata.map(([T, X, _]) => { return { x: T, y: X };});
    }
    
    getGraphDataY(): XY[] {
        return this.plotdata.map(([T, _, Y]) => { return { x: T, y: Y }; });
    }
}