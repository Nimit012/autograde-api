const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();


const sdk = require('microsoft-cognitiveservices-speech-sdk');
const _ = require('lodash');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3005;



app.use(bodyParser.json());


app.post('/autoGrade', async (req, res) => {
    const { audioBlobUrl, topic } = req.body;
    

    if (!audioBlobUrl || !topic) {
        return res.status(400).json({ error: 'Audio Blob URL and topic are required' });
    }
    
    try {
    const subscriptionKey = process.env.SUBSCRIPTION_KEY;;
    const serviceRegion = process.env.SERVICE_REGION;

    const response = await axios.get(audioBlobUrl, { responseType: 'arraybuffer' });
    const audioBuffer = Buffer.from(response.data);
    const audioFilePath = path.join(__dirname, 'temp_audio.wav');


    const audioFile = "./resources/Lauren_audio.wav";


    fs.writeFileSync(audioFilePath, audioBuffer);

    var audioConfig = sdk.AudioConfig.fromWavFileInput(
        fs.readFileSync(audioFilePath)
    );
    var speechConfig = sdk.SpeechConfig.fromSubscription(
        subscriptionKey,
        serviceRegion
    );

    // setting the recognition language to English.
    speechConfig.speechRecognitionLanguage = 'en-US';

    const pronunciationAssessmentConfig = new sdk.PronunciationAssessmentConfig(
        '',
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Phoneme,
        false
    );

    pronunciationAssessmentConfig.enableProsodyAssessment = true;
    pronunciationAssessmentConfig.enableContentAssessmentWithTopic(topic);



    // create the speech recognizer.
    var reco = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    pronunciationAssessmentConfig.applyTo(reco);

    var results = [];
    var recognizedText = '';

    reco.recognized = function (s, e) {
        var jo = JSON.parse(
            e.result.properties.getProperty(
                sdk.PropertyId.SpeechServiceResponse_JsonResult
            )
        );
        if (jo.DisplayText != '.') {
            recognizedText += jo.DisplayText + ' ';
        }
        results.push(jo);
        console.log("results:", results)
    };

    function onRecognizedResult() {
        var contentResult = results[results.length - 1].NBest[0].ContentAssessment;
        console.log("contentResult:", contentResult)
        res.json({
            recognizedText,
            vocabularyScore: Number(contentResult.VocabularyScore.toFixed(1)),
            grammarScore: Number(contentResult.GrammarScore.toFixed(1)),
            topicScore: Number(contentResult.TopicScore.toFixed(1))
        });
    }

    reco.canceled = function (s, e) {
        if (e.reason === sdk.CancellationReason.Error) {
            res.status(500).json({ error: e.errorDetails });
        }
        reco.stopContinuousRecognitionAsync();
    };

    reco.sessionStopped = function (s, e) {
        reco.stopContinuousRecognitionAsync();
        reco.close();
        onRecognizedResult();
    };

    reco.startContinuousRecognitionAsync();


} catch (error) {
    res.status(500).json({ error: 'Failed to fetch audio blob' });
}

});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});