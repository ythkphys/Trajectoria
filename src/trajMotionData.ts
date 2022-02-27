import Chart from "../node_modules/chart.js/auto/auto.esm";
import { TXY } from "./utilities";

type XY = { x: number, y: number };
export class TrajMotionData{
    private targetH: number;
    private plotdata: TXY[] = [];
    private chartX: Chart = undefined;
    private getGraphDataX(): XY[] {
        return this.plotdata.map(([T, X, _]) => { return { x: T, y: X }; });
    }

    private getGraphDataY(): XY[] {
        return this.plotdata.map(([T, _, Y]) => { return { x: T, y: Y }; });
    }
    
    reset(targetH: number) {
        this.targetH = targetH;
        this.plotdata = [];
        this.chartX?.destroy();

    }
    dispose() {
        this.targetH = 0;
        this.plotdata = [];
        this.chartX?.destroy();
     }
    addTXY([rawt,rawx,rawy]:TXY) {
        this.plotdata.push([rawt, rawx, this.targetH-rawy]);
    }
    
    getChartX(canvas: HTMLCanvasElement) {
       this.chartX = new Chart(canvas, {
            type: "scatter",
            data: {
                datasets: [
                    {
                        label: "横成分",
                        data: this.getGraphDataX(),
                        showLine: true,
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.5)',
                        pointRadius: 0,
                        tension: 0.4,
                    },
                    {
                        label: "縦成分",
                        data: this.getGraphDataY(),
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
        return this.chartX;
    }

    downloadCSVData() {
        const csv_string = this.plotdata.reduce((str, [T, X, Y]) => { return `${str}${T}, ${X}, ${Y}\r\n`; }, "time, x, y\r\n");
        const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
        const blob = new Blob([bom, csv_string], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = "output.csv";
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}