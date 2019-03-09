import axios from "axios";

const apiUrl = "https://sheets.googleapis.com/v4/spreadsheets";
const defaultSpreadsheetId = "1EYBBLTLXT5BbbDalENOaIQNIWBpkYrNxc64sETH7X6E";
const defaultKey = "AIzaSyC0anour3kbel1AV-hlxTiX9blUXUQqw3U";

const RANGE = "A1:AA600";

function generateUrl(spreadsheetId, range, key) {
    return `${apiUrl}/${spreadsheetId}/values/${range}?key=${key}`;
}

const getRelevantDistricts = (candidates) => {
    const candidateDistricts = candidates.reduce((acc, candidate) => {
        acc[candidate.district] = true;
        return acc;
    }, {});
    return Object.keys(candidateDistricts);
};

function getSpreadsheetData({
    spreadsheetId = defaultSpreadsheetId,
    range = RANGE,
    key = defaultKey,
}) {
    const requestUrl = generateUrl(spreadsheetId, range, key);
    return axios.get(requestUrl)
        .then(response => response.data.values);
}

function mapRow(row, fieldRowIndexMap) {
    const fieldNames = Object.keys(fieldRowIndexMap);
    return fieldNames.reduce((acc, fieldName) => {
        const result = acc;
        const fieldIndex = fieldRowIndexMap[fieldName];
        result[fieldName] = row[fieldIndex] || "";
        return result;
    }, {});
}

function buildFieldRowIndexMap(header) {
    const result = {};
    header.forEach((key, index) => {
        result[key] = index;
    });
    return result;
}

function parseSpreadsheetData(values) {
    const fieldRowIndexMap = buildFieldRowIndexMap(values[0]);
    const csvValues = values.slice(1).map(row => mapRow(row, fieldRowIndexMap));
    return csvValues;
}

function mapCandidates(csvData) {
    return csvData.map(csvDatum => ({
        name: csvDatum.Name,
        district: csvDatum.District,
        party: csvDatum.Party,
        candidateType: csvDatum["Candidate Type"],
        writeIn: csvDatum["Write In?"] === "TRUE",
        imageUrl: csvDatum["Candidate Picture URL"],
        website: csvDatum["Candidate Website URL"],
        facebookId: csvDatum["Candidate Facebook Name"],
        sponsoredLegislation: csvDatum["Sponsored Legislation"],
    }));
}

function mapQuestions(csvData) {
    const firstCandidate = csvData[0];
    const questions = Object.keys(firstCandidate)
        .filter(key => key !== "Candidate Name");
    const questionObjects = questions.map(questionText =>
        ({
            text: questionText,
            answers: csvData.map(csvDatum =>
                ({
                    candidate: csvDatum["Candidate Name"],
                    answer: csvDatum[questionText],
                })),
        }));
    return questionObjects;
}

function loadConfig({ accessKey, districtSpreadsheetMap, spreadsheetId }) {
    const windowConfig = window.CandidateQuestionnaire || {};
    return {
        accessKey: accessKey || windowConfig.accessKey || defaultKey,
        districtSpreadsheetMap: districtSpreadsheetMap || window.districtSpreadsheetMap,
        spreadsheetId: spreadsheetId || windowConfig.spreadsheetId || defaultSpreadsheetId,
    };
}

function determineSpreadsheetId(currentDistrict, config) {
    if (config.districtSpreadsheetMap === undefined || currentDistrict === undefined) {
        return config.spreadsheetId;
    }
    return config.districtSpreadsheetMap[currentDistrict];
}

export default class QuestionnaireClient {
    constructor(defaultConfig = {}) {
        this.candidatePromise = null;
        this.questionsPromise = null;
        this.config = loadConfig(defaultConfig);
    }

    getCandidates(currentDistrict) {
        if (this.candidatePromise === null) {
            const spreadsheetId = determineSpreadsheetId(currentDistrict, this.config);
            this.candidatePromise = getSpreadsheetData({
                key: this.config.accessKey,
                range: "Candidates!A1:AA500",
                spreadsheetId,
            })
                .then(parseSpreadsheetData)
                .then(mapCandidates);
        }
        return this.candidatePromise;
    }

    getQuestions(currentDistrict) {
        if (this.questionsPromise === null) {
            const spreadsheetId = determineSpreadsheetId(currentDistrict, this.config);
            this.questionsPromise = getSpreadsheetData({
                key: this.config.accessKey,
                range: "Questions!A1:AA500",
                spreadsheetId,
            })
                .then(parseSpreadsheetData)
                .then(mapQuestions);
        }
        return this.questionsPromise;
    }

    getRelevantDistricts() {
        const { districtSpreadsheetMap } = this.config;
        if (districtSpreadsheetMap !== undefined) {
            return Object.keys(districtSpreadsheetMap);
        }
        return this.getCandidates().then(getRelevantDistricts);
    }
}
