import { createRequire  } from "module";
const require = createRequire(import.meta.url);
const fs = require('fs');

const axios = require('axios');
const { parse } = require('csv-parse');
const {PromiseQueue, PromisePool} = require('./promise_queue');

const configs = require("./config.json");

const MAX_CONCURRENCY = configs.maxConcurrent; // set undefined to disable concurrency (excecute one by one)
const QUESTION_NUM = configs.questionNum;
const QuestionsPath = configs.questionPath;

const CLASS_ID = configs.CLASS_ID;
const AGENT = configs.AGENT;

if(!QUESTION_NUM || !QuestionsPath || !CLASS_ID || !AGENT) {
    console.log("EZQuestioner: [Error] Invalid configs, please check your config.json file.");
    process.exit(-1);
}
if(CLASS_ID.indexOf('*') !== -1) {
    console.log("EZQuestioner: [Error] Invalid configs, please fill in relative data in config.json file.");
    process.exit(-1);
}

const sendQuestion = async (client, question) => {
    try {
        const resQuestion = await client.post("/question", {
            title:    question,
            class_id: CLASS_ID,
            agent_id: AGENT
        })
        // console.log(resQuestion.data);
        if (!resQuestion?.data?.id) {
            return Promise.reject("Error: No question id");
        }

        const questionId = resQuestion.data.id;
        const resAnswer = await client.post(`/answer/${questionId}`, {
            entrance: "NORMAL",
            issue_config: { model: "MODEL-1" },
            issue_content: question
        });
        // console.log("------------------------------------------");
        // console.log(resAnswer.data);
        if(!resAnswer?.data?.answer_id) {
            return Promise.reject("Error: No answer id");
        }

        return Promise.resolve(resAnswer.data.answer_id);

    } catch (err){
        return Promise.reject(err);
    }
}

const parseCSV = (path) => {
    return new Promise((resolve, reject) => {
        let questions = [];
        fs.createReadStream(path)
            .pipe(parse({ delimiter: ',' }))
            .on('data', (row) => {
                questions.push(row);
            })
            .on('end', () => {
                questions.shift();
                questions = questions.map(row => row[1]);
                console.log(`Parsing csv done. ${questions.length} questions are loaded.`)
                resolve(questions);
                return;
            })
            .on('error', (error) => {
                console.error("Error parsing csv: " + error.message);
                console.log("Exiting...")
                reject(error);
                process.exit(-1);
            });
    })
}

const randomChoose = (arr, num) => {
    return arr.sort(() => Math.random() - 0.5).slice(0, num);
}

const sendQuestions = async (client, max_concurrency, questions) => {
    let successCnt = 0;
    const failedQuestions = [];

    if(!max_concurrency) {
        for(const i in questions) {
            console.log(`Processing idx = ${i}`);
            await sendQuestion(client, questions[i])
                .then(res => {
                    successCnt++;
                })
                .catch(err => {
                    failedQuestions.push(questions[i]);
                    console.log(`EZQuestioner: [Error] Axios ${err.message}`);
                })
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        return Promise.resolve({
            successCnt,
            failedQuestions
        });
    }

    return new Promise((resolve, reject) => {
        const queue = new PromiseQueue(max_concurrency);

        for (const question of questions) {
            queue.add(sendQuestion(client, question))
                .then((res) => {
                    successCnt++;
                })
                .catch((err) => {
                    failedQuestions.push(question);
                    // console.log(`Error: ${err}`);
                })
        }

        queue.on('finish', () => {
            resolve({
                successCnt,
                failedQuestions
            });
        })
    })
}

const main = async (question_num) => {
    const QuestionsPath = "./questions.csv";
    let questions = await parseCSV(QuestionsPath).catch(err => {
        console.log("EZQuestioner: [Error] " + err.message);
        process.exit(-1);
    });
    questions = randomChoose(questions, question_num);

    const client = axios.create({
        baseURL: configs.baseURL,
        headers: { ...configs.headers },
    });

    const result1 = await sendQuestions(client, MAX_CONCURRENCY, questions);
    console.log(`Successfully sent ${result1.successCnt}, Failed: ${result1.failedQuestions?.length ?? 0}`);
    if(result1.successCnt === question_num) {
        console.log("All questions are sent successfully, have a nice day😈:)");
        return;
    }

    console.log("Auto retry in 5 seconds...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    const result2 = await sendQuestions(client, MAX_CONCURRENCY, questions);
    console.log(`${result2.successCnt} more questions are sent successfully, ${result2.failedQuestions?.length ?? 0} failed.`);
    if(result1.successCnt + result2.successCnt === question_num) {
        console.log("All questions are sent successfully, have a nice day😈:)");
        return;
    }
    console.log(`Successfully sent ${result1.successCnt + result2.successCnt} questions, while failed on ${result2.failedQuestions} questions.`)
    console.log("Maybe try it later 🙁:(");
}

process.on('uncaughtException', (err) => {
    console.log("EZQuestioner: [Error] " + err.message);
    process.exit(-1);
});

try {
    main(QUESTION_NUM)
} catch (err){
    console.log("EZQuestioner: [Error] " + err.message);
    process.exit(-1);
}
// main(QUESTION_NUM).catch((err) => {
//     console.log("EZQuestioner: [Error] " + err);
//     process.exit(-1);
// });
