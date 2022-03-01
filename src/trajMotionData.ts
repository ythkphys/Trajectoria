import Chart from "../node_modules/chart.js/auto/auto.esm";
import { TXY } from "./utilities";

type xy = { x: number, y: number };
type plotElement = [t:number, x:number, y:number, vx:number, vy:number];
export class TrajMotionData{
    private startT: number;
    private tatgetH: number;
    private rawData: TXY[] = [];
    private plotData: plotElement[] = [];
    private chartX: Chart = undefined;
    private chartV: Chart = undefined;
    dispose() {
        this.rawData = [];
        this.plotData = [];
        this.chartX?.destroy();
        this.chartV?.destroy();
    }
    
    resetTXY(startT: number, targetH: number) {
        this.dispose();
        this.startT = startT;
        this.tatgetH = targetH;
    }
    
    addTXY([t, x, y]: TXY) {
        this.rawData.push([t-this.startT,x,this.tatgetH-y]);
    }


    private semi_diff(i: number, sign:(1|-1)){
        const rawData = this.rawData;
        const N = rawData.length;
        const L = Math.floor(N/10);
        const g = 0.9;
        if (i + sign * 3 >= rawData.length || i + sign * 3 < 0) {
            return [undefined, undefined];
        }
        else {
            let m000 = 0, m100 = 0, m200 = 0, m010 = 0, m020 = 0, m110 = 0, m001 = 0, m002 = 0, m101 = 0;
            let w = g;
            const rawlist = [];
            for (let j = 0; j < L && i + sign * j < N && i + sign * j >= 0; j++){
                rawlist.push(rawData[i+sign*j]);
            }
            rawlist.forEach(([t, x, y]) => {
                m000 += w;
                m100 += w * t;
                m200 += w * t * t;
                m010 += w * x;
                m020 += w * x * x;
                m110 += w * t * x;
                m001 += w * y;
                m002 += w * y * y;
                m101 += w * t * y;
                w *= g;
            });
            const D = m200 * m000 - m100 * m100;
            const Px = (m110 * m000 - m100 * m010) / D;
            const Qx = (m200 * m010 - m110 * m100) / D;
            const Rx = m020 - Px * m110 - Qx * m010;
            const Py = (m101 * m000 - m100 * m001) / D;
            const Qy = (m200 * m001 - m101 * m100) / D;
            const Ry = m002 - Py * m101 - Qy * m001;
            return [[Rx/m000, Px * rawData[i][0] + Qx, Px], [Ry/m000, Py * rawData[i][0] + Qy, Py]];
        }
    }
    private calcPlotData2() {
        const rawData = this.rawData;
        const N = rawData.length;
        this.plotData = rawData.map(([ti, xi, yi], i) => {
            const [rxvR, ryvR] = this.semi_diff(i, +1);
            const [rxvL, ryvL] = this.semi_diff(i, -1);
            let vx=undefined, vy=undefined;
            if (rxvR && rxvL) {
                const divX = rxvR[0] + rxvL[0];
                const divY = ryvR[0] + ryvL[0];
                xi = (rxvR[0] * rxvL[1] + rxvL[0] * rxvR[1]) / divX;
                vx = (rxvR[0] * rxvL[2] + rxvL[0] * rxvR[2]) / divX;
                yi = (ryvR[0] * ryvL[1] + ryvL[0] * ryvR[1]) / divY;
                vy = (ryvR[0] * ryvL[2] + ryvL[0] * ryvR[2]) / divY;
            }
            else if (rxvR) {
                [, xi, vx] = rxvR;
                [, yi, vy] = ryvR;
            }
            else if (rxvL) {
                [, xi, vx] = rxvL;
                [, yi, vy] = ryvL;
            }
            return [ti, xi, yi, vx, vy];
        });
    }

    private calcPlotData() { 
        const width = 0.15;
        const rawData = this.rawData;
        const N = rawData.length;
        this.plotData = rawData.map(([ti, xi, yi]) => {
            let t0 = 0, t1 = 0, t2 = 0, t3 = 0, t4 = 0;
            let x0 = 0, x1 = 0, x2 = 0;
            let y0 = 0, y1 = 0, y2 = 0;
            for (let j = 0; j < N; j++) {
                const [t, x, y] = rawData[j];
                const w = Math.exp(-0.5 * ((t - ti) / width) ** 2);
                const wt0 = w;
                const wt1 = wt0 * t;
                const wt2 = wt1 * t;
                const wt3 = wt2 * t;
                const wt4 = wt3 * t;
                t0 += wt0;
                t1 += wt1;
                t2 += wt2;
                t3 += wt3;
                t4 += wt4;
                x0 += wt0 * x;
                x1 += wt1 * x;
                x2 += wt2 * x;
                y0 += wt0 * y;
                y1 += wt1 * y;
                y2 += wt2 * y;
            }

            const t40_22 = t4 * t0 - t2 * t2;
            const t20_11 = t2 * t0 - t1 * t1;
            const t30_21 = t3 * t0 - t2 * t1;
            const D = t40_22 * t20_11 - t30_21 * t30_21;
            const Ax = ((x2 * t0 - x0 * t2) * t20_11 - (x1 * t0 - x0 * t1) * t30_21) / D;
            const Bx = ((x1 * t0 - x0 * t1) * t40_22 - (x2 * t0 - x0 * t2) * t30_21) / D;
            const Ay = ((y2 * t0 - y0 * t2) * t20_11 - (y1 * t0 - y0 * t1) * t30_21) / D;
            const By = ((y1 * t0 - y0 * t1) * t40_22 - (y2 * t0 - y0 * t2) * t30_21) / D;
            const ax = 2 * Ax;
            const ay = 2 * Ay;
            const vx = (x1 * t0 - x0 * t1) / t20_11;//Bx + ax * ti;
            const vy = (y1 * t0 - y0 * t1) / t20_11;//By + ay * ti;
            return [ti, xi, yi, vx, vy];
         });
    }

    
    plotCharts(canvasX: HTMLCanvasElement, canvasV: HTMLCanvasElement ) {
        this.calcPlotData2();
        const plotData = this.plotData;
        const N = plotData.length;
        const graphData: xy[][] = [[],[],[],[]];
        for (let i = 0; i < N; i++) {
            const [T,X,Y,VX,VY] = plotData[i];
            graphData[0].push({ x: T, y: X });
            graphData[1].push({ x: T, y: Y });
            graphData[2].push({ x: T, y: VX});
            graphData[3].push({ x: T, y: VY});
        }
        this.chartX?.destroy();
        this.chartV?.destroy();

        this.chartX = new Chart(canvasX, {
            type: "scatter",
            data: {
                datasets: [
                    {
                        label: "横成分",
                        data: graphData[0],
                        showLine: true,
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.5)',
                        pointRadius: 0,
                        tension: 0.4,
                    },
                    {
                        label: "縦成分",
                        data: graphData[1],
                        showLine: true,
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.5)',
                        pointRadius: 0,
                        tension: 0.4,
                    },
                ],
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: "時間 [s]",
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: "位置 [px]",
                        }
                    },
                },
                plugins: {
                    title: {
                        display: true,
                        text: "位置の時間変化"
                    }
                }
            }
        });
        this.chartV = new Chart(canvasV, {
            type: "scatter",
            data: {
                datasets: [
                    {
                        label: "横成分",
                        data: graphData[2],
                        showLine: true,
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.5)',
                        pointRadius: 0,
                        tension: 0.4,
                    },
                    {
                        label: "縦成分",
                        data: graphData[3],
                        showLine: true,
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.5)',
                        pointRadius: 0,
                        tension: 0.4,
                    },
                ],
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: "時間 [s]",
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: "速度 [px/s]",
                        }
                    },
                },
                plugins: {
                    title: {
                        display: true,
                        text: "速度の時間変化"
                    }
                }
            }
        });
    }

    downloadCSVData(str:string) {
        let csv_string = str === "X" ?
            this.plotData.reduce((str, [T, X, Y,,]) => { return `${str}${T}, ${X}, ${Y}\r\n`; }, "time, x, y\r\n") :
            this.plotData.reduce((str, [T,,,VX, VY]) => { return `${str}${T}, ${VX}, ${VY}\r\n`; }, "time, x, y\r\n");        
        const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
        const blob = new Blob([bom, csv_string], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = `output${str}.csv`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}