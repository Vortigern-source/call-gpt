const OpenAI = require('openai');
const moment = require('moment-timezone');
const EventEmitter = require('events');
const tools = require('../functions/function-manifest');

const availableFunctions = {};
tools.forEach((tool) => {
  let functionName = tool.function.name;
  availableFunctions[functionName] = require(`../functions/${functionName}`);
});

class GptService extends EventEmitter {
  constructor() {
    super();
    this.openai = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1"
    });
    this.userContext = [
      { 
        "role": "system", 
        "content": `You are Josh, an assistant at Manchester Airport Parking. Follow these steps EXACTLY:
    
        1. Car Registration Confirmation:
           - When a customer provides a registration number, repeat it back EXACTLY.
           - Ask "Is that correct?" and wait for confirmation before proceeding.
           - Do NOT proceed until the customer confirms the registration.
    
        2. Booking Verification:
           - Use findBooking function to retrieve details.
           - Confirm customer name, booking time (12-hour format), terminal, and contact number.
           - DO NOT mention the allocated car park at this stage.
    
        3. ETA Update:
           - Ask for the customer's estimated time of arrival.
           - If they give a relative time (e.g., "20 minutes"), calculate the actual time.
           - Confirm the final ETA with the customer.
           - Use updateETA function to update the booking.
    
        4. Provide Instructions:
           - ONLY AFTER updating ETA, provide clear directions on arrival location, including car park and level.
    
        5. Notify Management:
           - Use whatsappMessage function to notify the manager.
           - Don't inform the customer about this message.
    
        Maintain a professional, friendly tone. Use '•' for natural pauses. Don't use emojis.
    
        IMPORTANT: Always follow this exact order. Do not skip steps or provide information out of order.`
      },
      { 
        "role": "assistant", 
        "content": `Hi! This is Manchester Airport Parking. How can I help you with your booking today?` 
      },
    ];
    this.partialResponseIndex = 0;
    this.etaConfirmed = false;
    this.lastRegistration = null;
    this.transcriptionBuffer = '';
    this.processingTranscription = false;
  }

  getCurrentTime() {
    return moment().tz('Europe/London').format('h:mm A [BST]');
  }

  setCallSid(callSid) {
    this.userContext.push({ 'role': 'system', 'content': `callSid: ${callSid}` });
  }

  updateUserContext(name, role, content) {
    if (typeof content !== 'string') {
      content = JSON.stringify(content, null, 2);
    }
    if (name !== 'user') {
      this.userContext.push({ role, name, content });
    } else {
      this.userContext.push({ role, content });
    }
  }

  async handleTranscription(transcription, isFinal) {
    this.transcriptionBuffer += ' ' + transcription;
    
    if (isFinal || this.transcriptionBuffer.trim().length > 100) {  // Process if final or buffer is long enough
      if (!this.processingTranscription) {
        this.processingTranscription = true;
        await this.processTranscription();
        this.processingTranscription = false;
      }
    }
  }
  async processTranscription() {
    const fullTranscription = this.transcriptionBuffer.trim();
    if (fullTranscription) {
      await this.completion(fullTranscription, this.partialResponseIndex, 'user');
      this.transcriptionBuffer = '';
    }
  }
  async completion(text, interactionCount, role = 'user', name = 'user') {
    this.updateUserContext(name, role, text);
  
    const response = await this.openai.chat.completions.create({
      model: 'llama3-groq-70b-8192-tool-use-preview',
      messages: this.userContext,
      tools: tools,
      tool_choice: 'auto',
    });
  
    const responseMessage = response.choices[0].message;
    let toolCalls = responseMessage.tool_calls;
  
    // Check if tool calls are embedded in the content
    if (!toolCalls && responseMessage.content.includes('<tool_call>')) {
      const toolCallMatch = responseMessage.content.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
      if (toolCallMatch) {
        try {
          toolCalls = [JSON.parse(toolCallMatch[1])];
        } catch (error) {
          console.error('Error parsing embedded tool call:', error);
        }
      }
    }

    if (toolCalls && toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        const functionName = toolCall.name || toolCall.function?.name;
        const functionToCall = availableFunctions[functionName];
        let functionArgs = toolCall.arguments || toolCall.function?.arguments;
  
        if (typeof functionArgs === 'string') {
          try {
            functionArgs = JSON.parse(functionArgs);
          } catch (error) {
            console.error('Error parsing function arguments:', error);
            functionArgs = {};
          }
        }
  
        try {
          const functionResponse = await functionToCall(functionArgs);
          this.updateUserContext(functionName, 'function', functionResponse);
        } catch (error) {
          console.error(`Error calling function ${functionName}:`, error);
          this.updateUserContext(functionName, 'function', JSON.stringify({ error: error.message }));
        }
      }
  
      // Make a second API call with the updated context
      const secondResponse = await this.openai.chat.completions.create({
        model: 'llama3-groq-70b-8192-tool-use-preview',
        messages: this.userContext,
      });
  
      this.handleResponse(secondResponse.choices[0].message, interactionCount);
    } else {
      this.handleResponse(responseMessage, interactionCount);
    }
  }

  handleResponse(responseMessage, interactionCount) {
    console.log('Response message:', JSON.stringify(responseMessage, null, 2));
  
    const response = responseMessage.content;
  
    if (typeof response !== 'string') {
      console.error('Unexpected response format:', response);
      return;
    }
  
    let partialResponse = '';
    for (const char of response) {
      partialResponse += char;
      if (char === '•' || char === '.') {
        this.emit('gptreply', {
          partialResponseIndex: this.partialResponseIndex,
          partialResponse
        }, interactionCount);
        this.partialResponseIndex++;
        partialResponse = '';
      }
    }
  
    if (partialResponse) {
      this.emit('gptreply', {
        partialResponseIndex: this.partialResponseIndex,
        partialResponse
      }, interactionCount);
      this.partialResponseIndex++;
    }
  
    this.userContext.push({ 'role': 'assistant', 'content': response });
    console.log(`GPT -> user context length: ${this.userContext.length}`);
  }
}

module.exports = { GptService };