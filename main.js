const fetchSync = require('sync-fetch');
const Database = require("better-sqlite3");

const db = new Database("database.db");

let queuedRuns = []; // [1, 2, 3...]
let activeRuns = []; // [[4, start_timestamp, start_date], [5, start_timestamp, start_date]...]
let checksCounter = []; // [[run, checks]...]

// howard R, 95th R
let departureStations = [30174, 30088];
// ohare B, forest park B
// [30172, 30076, 30250]

// midway O, 54th Pink, kimball Brown
// [30181, 30113]

// howard YP, skokie Y, linden P
// [30175, 30027, 30204]

// harlem/lake G, cottage grove G, ashland/63rd G
// [30003, 30140, 30056]

console.log("Initialized");

setInterval(function(){
    console.log("Starting cycle")
    departureStations.forEach(stationId => {
        console.log("Checking station", stationId)
        getRunsQueuedAtStop(stationId).forEach(run => {
            if(queuedRuns.indexOf(run) == -1){
                queuedRuns.push(run);
                checksCounter.push([run, 0]);
                console.log("Queued run", run);
            }
        });
    });
    queuedRuns.forEach(run => {
        console.log("Checking queued run", run);
        if(getRunStatus(run) == 0){
            queuedRuns.splice(queuedRuns.indexOf(run), 1);
            activeRuns.push([run, parseInt((Date.now()/1000)), formatDateISO()]);
            console.log("Made run", run, "active");
            for(let i = 0; i < checksCounter.length; i++){
                if(checksCounter[i][0] == run){
                    checksCounter.splice(i, 1);
                }
            }
        }
        else{
            for(let i = 0; i < checksCounter.length; i++){
                if(checksCounter[i][0] == run){
                    checksCounter[i][1]++;
                    if(checksCounter[i][1] > 30){
                        queuedRuns.splice(queuedRuns.indexOf(checksCounter[i][0]), 1);
                        checksCounter.splice(i, 1);
                        console.log("Cancelled run", run);
                    }
                }
            }
        }
    });
    let loc = 0;
    activeRuns.forEach(run => {
        console.log("Checking active run", run);
        if(getRunStatus(run[0]) == 1){
            let seconds = parseInt((Date.now()/1000)) - run[1];
            let timestamp = run[2];
            activeRuns.splice(loc, 1);
            insertIntoDb(run[0], seconds, timestamp);
            console.log("Logged run", run, "as complete, with a total time of", seconds, "seconds and a starting timestamp of", timestamp);
        }
        loc++;
    });
}, 60000);

// returns array of run numbers
function getRunsQueuedAtStop(id){
    let runs = [];
    try {
        const response = fetchSync(`https://lapi.transitchicago.com/api/1.0/ttarrivals.aspx?stpid=${id}&outputType=json&max=5&key=8244c227116548aab596807fc6771eff`);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const etas = response.json()["ctatt"]["eta"];
        etas.forEach(eta => {
            runs.push(eta["rn"]);
        })
    } 
    catch (error) {
        console.error('Error:', error.message);
    }
    return runs;
}

// 0=active, 1=not active
function getRunStatus(run){
    try {
        const response = fetchSync(`https://lapi.transitchicago.com/api/1.0/ttfollow.aspx?key=8244c227116548aab596807fc6771eff&runnumber=${run}&outputType=JSON`);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        let errCode = response.json()["ctatt"]["errCd"];
        
        if(errCode == 502){ // delayed
            errCode = 3;
        }
        if(errCode == 501){
            errCode = 1;
        }
        if(errCode == 503){ // another way of saying arrived
            errCode = 1;
        }
        return errCode;
    } 
    catch (error) {
        console.error('Error:', error.message);
    }
    return 2;
}

function formatDateISO() {
  const d = new Date();

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function insertIntoDb(run, seconds, timestamp){
    const stmt = db.prepare(`
        INSERT INTO timings (run, seconds, start_time) VALUES (${run}, ${seconds}, '${timestamp}');
    `);
    stmt.run();
}