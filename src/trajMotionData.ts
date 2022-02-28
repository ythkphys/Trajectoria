import Chart from "../node_modules/chart.js/auto/auto.esm";
import { TXY } from "./utilities";

type xy = {x:number,y:number};
export class TrajMotionData{
    private startT: number;
    private tatgetH: number;
    private basicData: TXY[] = [];
    private vxData: number[] = [];
    private vyData: number[] = [];
    private chartX: Chart = undefined;
    private chartV: Chart = undefined;
    dispose() {
        this.basicData = [];
        this.vxData = [];
        this.vyData = [];
        this.chartX?.destroy();
        this.chartV?.destroy();
    }
    
    resetTXY(startT: number, targetH: number) {
        this.dispose();
        this.startT = startT;
        this.tatgetH = targetH;
    }
    
    addTXY([t, x, y]: TXY) {
        this.basicData.push([t-this.startT,x,this.tatgetH-y]);
    }

    private calcPlotData() { 
        const width = 0.15;
        const basicData = this.basicData;
        const N = basicData.length;
        for (let i = 0; i < N; i++){
            let t0 = 0, t1 = 0, t2 = 0, t3 = 0, t4 = 0;
            let x0 = 0, x1 = 0, x2 = 0;
            let y0 = 0, y1 = 0, y2 = 0;
            
            const ti = basicData[i][0];
            for (let j = 0; j < N; j++){
                const [t, x, y] = basicData[j];
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
            this.vxData.push(vx);
            this.vyData.push(vy);
        }
    }

    
    plotCharts(canvasX: HTMLCanvasElement, canvasV: HTMLCanvasElement ) {
        this.calcPlotData();
        const basicData = this.basicData;
        const vxData = this.vxData;
        const vyData = this.vyData;
        const N = this.basicData.length;
        const graphData: xy[][] = [[],[],[],[]];
        for (let i = 0; i < N; i++) {
            const [T,X,Y] = basicData[i];
            graphData[0].push({ x: T, y: X });
            graphData[1].push({ x: T, y: Y });
            graphData[2].push({ x: T, y: vxData[i] });
            graphData[3].push({ x: T, y: vyData[i] });
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
            this.basicData.reduce((str, [T, X, Y]) => { return `${str}${T}, ${X}, ${Y}\r\n`; }, "time, x, y\r\n") :
            undefined;//  this.ddts.reduce((str, [T, VX, VY,,]) => { return `${str}${T}, ${VX}, ${VY}\r\n`; }, "time, x, y\r\n");        
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