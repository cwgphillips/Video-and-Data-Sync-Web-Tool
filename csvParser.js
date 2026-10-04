// csvParser.js
import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm';

export class IMUDataParser {
  /**
   * Parses an IMU CSV file into Float32Arrays suitable for uPlot.
   * @param {File} file 
   * @returns {Promise<{data: Float32Array[], seriesLabels: string[]}>}
   */
  static parse(file) {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (!results.data || results.data.length === 0) {
            reject(new Error("CSV file is empty or invalid"));
            return;
          }

          const rows = results.data;
          const totalRows = rows.length;
          const headers = Object.keys(rows[0]);

          // Identify time column (default to first column or any column containing 'time')
          let timeCol = headers.find(h => /time|timestamp|sec/i.test(h)) || headers[0];
          
          // Select numerical columns to plot (limit to first 6 numeric series if large)
          const dataCols = headers.filter(h => h !== timeCol && typeof rows[0][h] === 'number').slice(0, 6);

          // Allocate memory upfront with Typed Arrays
          const timeData = new Float32Array(totalRows);
          const seriesArrays = dataCols.map(() => new Float32Array(totalRows));

          const startTime = Number(rows[0][timeCol]) || 0;
          const normalizeTime = startTime > 1e9; // Check if epoch milliseconds/nanoseconds

          for (let i = 0; i < totalRows; i++) {
            const row = rows[i];
            let rawTime = Number(row[timeCol]);
            
            // Normalize epoch timestamps to relative seconds starting at 0
            if (normalizeTime) {
              timeData[i] = (rawTime - startTime) / 1000;
            } else {
              timeData[i] = rawTime;
            }

            for (let s = 0; s < dataCols.length; s++) {
              seriesArrays[s][i] = Number(row[dataCols[s]]) || 0;
            }
          }

          resolve({
            data: [timeData, ...seriesArrays],
            seriesLabels: dataCols,
            startTimeOffset: normalizeTime ? startTime : 0
          });
        },
        error: (err) => reject(err)
      });
    });
  }
}