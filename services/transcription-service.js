require('colors');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');

class TranscriptionService extends EventEmitter {
  constructor() {
    super();
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
    this.dgConnection = deepgram.listen.live({
      encoding: 'mulaw',
      sample_rate: '8000',
      model: 'nova-2',
      punctuate: true,
      interim_results: true,
      endpointing: 200,
      utterance_end_ms: 1000
    });

    this.finalResult = '';
    this.speechFinal = false;
    this.lastSpeechTime = Date.now();
    this.silenceThreshold = 2000; // 1 second of silence
    this.silenceTimer = null;

    this.dgConnection.on(LiveTranscriptionEvents.Open, () => {
      this.dgConnection.on(LiveTranscriptionEvents.Transcript, (transcriptionEvent) => {
        const alternatives = transcriptionEvent.channel?.alternatives;
        let text = '';
        if (alternatives) {
          text = alternatives[0]?.transcript;
        }
        
        if (transcriptionEvent.type === 'UtteranceEnd') {
          if (!this.speechFinal && this.finalResult.trim().length > 0) {
            console.log(`UtteranceEnd received before speechFinal, emit the text collected so far: ${this.finalResult}`.yellow);
            this.emit('transcription', this.finalResult);
            this.finalResult = '';
            this.speechFinal = false;
          } else {
            console.log('STT -> Speech was already final when UtteranceEnd received'.yellow);
          }
          return;
        }
    
        if (transcriptionEvent.is_final === true && text.trim().length > 0) {
          this.finalResult += ` ${text}`;
          this.lastSpeechTime = Date.now();
          this.resetSilenceTimer();

          if (transcriptionEvent.speech_final === true) {
            this.speechFinal = true;
            console.log(`Speech final received, emitting transcription: ${this.finalResult}`.yellow);
            this.emit('transcription', this.finalResult);
            this.finalResult = '';
          }
        } else {
          this.emit('utterance', text);
          if (text.trim().length > 0) {
            this.lastSpeechTime = Date.now();
            this.resetSilenceTimer();
          }
        }
      });

      this.dgConnection.on(LiveTranscriptionEvents.Error, (error) => {
        console.error('STT -> deepgram error');
        console.error(error);
      });

      this.dgConnection.on(LiveTranscriptionEvents.Warning, (warning) => {
        console.error('STT -> deepgram warning');
        console.error(warning);
      });

      this.dgConnection.on(LiveTranscriptionEvents.Metadata, (metadata) => {
        console.error('STT -> deepgram metadata');
        console.error(metadata);
      });

      this.dgConnection.on(LiveTranscriptionEvents.Close, () => {
        console.log('STT -> Deepgram connection closed'.yellow);
      });
    });
  }

  resetSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }
    this.silenceTimer = setTimeout(() => {
      this.handleSilence();
    }, this.silenceThreshold);
  }

  handleSilence() {
    if (Date.now() - this.lastSpeechTime >= this.silenceThreshold && this.finalResult.trim().length > 0) {
      console.log(`Silence detected, emitting transcription: ${this.finalResult}`.yellow);
      this.emit('transcription', this.finalResult);
      this.finalResult = '';
      this.speechFinal = false;
    }
  }

  /**
   * Send the payload to Deepgram
   * @param {String} payload A base64 MULAW/8000 audio stream
   */
  send(payload) {
    if (this.dgConnection.getReadyState() === 1) {
      this.dgConnection.send(Buffer.from(payload, 'base64'));
    }
  }
}

module.exports = { TranscriptionService };