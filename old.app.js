require('colors');
const EventEmitter = require('events');
const OpenAI = require('openai');
const Groq = require('groq');
const moment = require('moment-timezone');
const tools = require('../functions/function-manifest');

// Import all functions included in function manifest
const availableFunctions = {};
tools.forEach((tool) => {
  let functionName = tool.function.name;
  availableFunctions[functionName] = require(`../functions/${functionName}`);
});

class GptService extends EventEmitter {
  constructor() {
    super();
    this.openai = new OpenAI();
    this.userContext = [
      { 
        "role": "system", 
        "content": `You are an assistant at Manchester Airport Parking, and your name is Josh. If they ask the current time tell them it's ${this.getCurrentTime()} .You handle booking inquiries and provide assistance based on customer requests. You have a youthful and cheery personality. Keep your responses as brief as possible but make every attempt to keep the caller on the phone without being rude. Don't ask more than 1 question at a time. Don't make assumptions about what values to plug into functions. When a customer provides a car registration number, use the findBooking function. When you need to update an ETA, use the updateETA function. After confirming the ETA and providing instructions, use the whatsappMessage function to notify the manager. When a customer provides a car registration number, follow these steps to handle the conversation smoothly:

          Confirm Car Registration: Confirm the car registration number provided by the customer by repeating it back to them. Make sure they confirm it\'s the right car registration number before proceeding. Ensure that all parts of the registration number are pronounced aloud. If the customer confirms it, proceed to check their booking details in the backend database.

          Verify Booking Details: Once you retrieve the booking details, confirm the booking time, terminal, and contact number with the customer. Ensure to ask for the customer\'s expected arrival time.

          Accurate Arrival Time: Request an accurate arrival time from the customer. If they provide a rough estimate like "20 minutes," calculate the estimated time by adding that number to the current time, and update the booking record with this time in the Current_ETA field. If the customer provides a specific time like "12:30 PM," use that time to update the Current_ETA field. Always confirm with the customer if the ETA needs to be more accurate.

          Provide Instructions: Based on the booking details, provide clear instructions to the customer about where they should go upon arrival, including the allocated car park and level.

          Send Message to Group: Once you have completed the above, Send a WhatsApp message to the manager with booking details for driver assignment. You do not need to tell the customer you are sending a message, just do it regardless. But always ensure that before you do this that the current eta has been updated.

          Professional and Friendly Tone: Be professional and friendly throughout the conversation. Ensure your responses flow naturally, pausing only where natural grammar prompts. Use a '•' symbol for pauses that align with natural breaks in speech, the breaks should mainly be where there are commas and full stops. Avoid artificial breaks and focus on delivering smooth, conversational responses.

          Do not use emojis anywhere in your responses. You can use grammar such as exclamation marks to depict emotion.

          Example Flow:

          Customer: Hi, I\'m calling in for a booking today.
          Assistant: Okay. Whats your car registration number?
          Customer: It's {car_registration}.
          Assistant: Let me confirm that the registration number is {car_registration}. Is that correct?
          Customer: Yes, that\'s correct.
          Assistant: Great! I see you\'re booked for {Arrival Time} at {Terminal}. The contact number I have for you is {Contact_Number}. Is that correct?
          Customer: Yes.
          Assistant: Perfect. What time are you expected to arrive at {Terminal}
          Customer: In about 30 minutes.
          Assistant: Okay, So that would make it 8:38, It\'s important we get an accurate eta. If you have a navigation system could you tell me whats your time of arrival?
          Customer: It's saying 8:35.
          Assistant: Okay, perfect. If your coming to {{Terminal} please make sure you come to {{allocated_car_park}} on level 0 and wait for us.
          Customer: Alright Thank you
          Assistant: A driver will be assigned soon, he\'ll call you when he\'s close buy, just wait by the car park. Thanks!
        ` 
      },
      { 
        "role": "assistant", 
        "content": "Hi! This is Manchester Airport Parking, how can I help you?" 
      },
    ];
    this.partialResponseIndex = 0;
  }

  setCallSid(callSid) {
    this.userContext.push({ 'role': 'system', 'content': `callSid: ${callSid}` });
  }

  validateFunctionArgs(args) {
    try {
      return JSON.parse(args);
    } catch (error) {
      console.log('Warning: Double function arguments returned by OpenAI:', args);
      const argsArray = args.split('}{').map((arg, idx, array) => {
        if (idx > 0) arg = '{' + arg;
        if (idx < array.length - 1) arg = arg + '}';
        return JSON.parse(arg);
      });
      return Object.assign({}, ...argsArray);
    }
  }
  
  getCurrentTime() {
    return moment().tz('Europe/London').format('HH:mm [BST]');
  }
  
  updateUserContext(name, role, content) {
    if (typeof content !== 'string') {
      console.error('Expected content to be a string but got', typeof content, content);
      content = JSON.stringify(content, null, 2);
    }
    if (name !== 'user') {
      this.userContext.push({ role, name, content });
    } else {
      this.userContext.push({ role, content });
    }
  }

  async completion(text, interactionCount, role = 'user', name = 'user') {
    if (typeof text !== 'string') {
      console.error('Expected text to be a string but got', typeof text, text);
      text = JSON.stringify(text, null, 2);
    }
    this.updateUserContext(name, role, text);

    const regExp = /registration number is (\w+)/i;
    const match = text.match(regExp);

    if (match) {
      const registration = match[1];
      await this.handleFindBooking(registration, interactionCount);
      return;
    }

    const etaRegExp = /(in \d+ minutes|at \d{1,2}:\d{2}\s*(AM|PM)?|\d{1,2}:\d{2}\s*(AM|PM)?)/i;
    const etaMatch = text.match(etaRegExp);

    if (etaMatch) {
      const etaString = etaMatch[0];
      await this.handleUpdateETA(etaString, interactionCount);
      return;
    }

    await this.handleGptCompletion(interactionCount);
  }

  async handleUpdateETA(etaString, interactionCount) {
    const updateETAFunction = availableFunctions['updateETA'];
    const registration = this.getRegistrationFromContext();
    const currentTime = this.getCurrentTime();
  
    // Update ETA
    const updateETAArgs = { registration, customerETA: etaString, currentTime };
    const updateETASay = `I'll update your estimated time of arrival. The current time is ${currentTime}. Just a moment.`;
    this.emit('gptreply', { partialResponseIndex: null, partialResponse: updateETASay }, interactionCount);
      
      let etaResponse = await updateETAFunction(updateETAArgs);
      this.updateUserContext('updateETA', 'function', etaResponse);
    
      // Parse the ETA response
      let parsedEtaResponse;
      try {
        parsedEtaResponse = JSON.parse(etaResponse);
      } catch (error) {
        console.error('Error parsing ETA response:', error);
        return;
      }
    
      // If ETA update was successful, update the context
      if (parsedEtaResponse.success) {
        const bookingDetails = this.getBookingDetailsFromContext();
        bookingDetails.customerETA = parsedEtaResponse.updatedRecord.fields.Current_ETA;
        this.updateUserContext('bookingDetails', 'system', JSON.stringify(bookingDetails));
      }
    
      // Continue the conversation to get instructions for the customer
      await this.handleGptCompletion(interactionCount);
    }

  async handleGptCompletion(interactionCount) {
    const stream = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: this.userContext,
      tools: tools,
      stream: true,
    });

    let completeResponse = '';
    let partialResponse = '';
    let functionName = '';
    let functionArgs = '';
    let finishReason = '';

    function collectToolInformation(deltas) {
      let name = deltas.tool_calls[0]?.function?.name || '';
      if (name != '') {
        functionName = name;
      }
      let args = deltas.tool_calls[0]?.function?.arguments || '';
      if (args != '') {
        functionArgs += args;
      }
    }

    for await (const chunk of stream) {
      let content = chunk.choices[0]?.delta?.content || '';
      let deltas = chunk.choices[0].delta;
      finishReason = chunk.choices[0].finish_reason;

      if (deltas.tool_calls) {
        collectToolInformation(deltas);
      }

      if (finishReason === 'tool_calls') {
        const functionToCall = availableFunctions[functionName];
        const validatedArgs = this.validateFunctionArgs(functionArgs);
        const toolData = tools.find(tool => tool.function.name === functionName);
        const say = toolData.function.say;
        this.emit('gptreply', {
          partialResponseIndex: null,
          partialResponse: say
        }, interactionCount);
        let functionResponse = await functionToCall(validatedArgs);
        this.updateUserContext(functionName, 'function', functionResponse);
        
        // If the function called was whatsappMessage, don't call completion again
        if (functionName !== 'whatsappMessage') {
          await this.completion(functionResponse, interactionCount, 'function', functionName);
        }
      } else {
        completeResponse += content;
        partialResponse += content;
        if (content.trim().slice(-1) === '•' || finishReason === 'stop') {
          const gptReply = {
            partialResponseIndex: this.partialResponseIndex,
            partialResponse
          };
          this.emit('gptreply', gptReply, interactionCount);
          this.partialResponseIndex++;
          partialResponse = '';
        }
      }
    }
    this.userContext.push({ 'role': 'assistant', 'content': completeResponse });
    console.log(`GPT -> user context length: ${this.userContext.length}`.green);
  }

  async handleWhatsAppMessage(args, interactionCount) {
    const whatsappMessageFunction = availableFunctions['whatsappMessage'];
    const validatedArgs = this.validateFunctionArgs(args);
    const whatsappMessageSay = tools.find(tool => tool.function.name === 'whatsappMessage').function.say;
    this.emit('gptreply', { partialResponseIndex: null, partialResponse: whatsappMessageSay }, interactionCount);

    let whatsappResponse = await whatsappMessageFunction(validatedArgs);
    this.updateUserContext('whatsappMessage', 'function', whatsappResponse);
  }


  getRegistrationFromContext() {
    const bookingContext = this.userContext.find(ctx => ctx.name === 'findBooking');
    return bookingContext ? JSON.parse(bookingContext.content).registration : null;
  }

  getBookingDetailsFromContext() {
    const bookingContext = this.userContext.find(ctx => ctx.name === 'findBooking');
    return bookingContext ? JSON.parse(bookingContext.content) : {};
  }

  async handleGptCompletion(interactionCount) {
    const stream = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: this.userContext,
      tools: tools,
      stream: true,
    });

    let completeResponse = '';
    let partialResponse = '';
    let functionName = '';
    let functionArgs = '';
    let finishReason = '';

    function collectToolInformation(deltas) {
      let name = deltas.tool_calls[0]?.function?.name || '';
      if (name != '') {
        functionName = name;
      }
      let args = deltas.tool_calls[0]?.function?.arguments || '';
      if (args != '') {
        functionArgs += args;
      }
    }

    for await (const chunk of stream) {
      let content = chunk.choices[0]?.delta?.content || '';
      let deltas = chunk.choices[0].delta;
      finishReason = chunk.choices[0].finish_reason;

      if (deltas.tool_calls) {
        collectToolInformation(deltas);
      }

      if (finishReason === 'tool_calls') {
        const functionToCall = availableFunctions[functionName];
        const validatedArgs = this.validateFunctionArgs(functionArgs);
        const toolData = tools.find(tool => tool.function.name === functionName);
        const say = toolData.function.say;
        this.emit('gptreply', {
          partialResponseIndex: null,
          partialResponse: say
        }, interactionCount);
        let functionResponse = await functionToCall(validatedArgs);
        this.updateUserContext(functionName, 'function', functionResponse);
        await this.completion(functionResponse, interactionCount, 'function', functionName);
      } else {
        completeResponse += content;
        partialResponse += content;
        if (content.trim().slice(-1) === '•' || finishReason === 'stop') {
          const gptReply = {
            partialResponseIndex: this.partialResponseIndex,
            partialResponse
          };
          this.emit('gptreply', gptReply, interactionCount);
          this.partialResponseIndex++;
          partialResponse = '';
        }
      }
    }
    this.userContext.push({ 'role': 'assistant', 'content': completeResponse });
    console.log(`GPT -> user context length: ${this.userContext.length}`.green);
  }
}

module.exports = { GptService };