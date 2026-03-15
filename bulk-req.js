import fetch from "node-fetch";

const URL = "https://bhartlottery.com/cron-insert.php";
const TOTAL_HITS = 100;

const requests = [];

for (let i = 1; i <= TOTAL_HITS; i++) {
  requests.push(
    fetch(URL).then(res =>
      console.log(`Hit ${i} → ${res.status}`)
    )
  );
}

Promise.all(requests)
  .then(() => console.log("All hits completed"))
  .catch(err => console.error(err));
