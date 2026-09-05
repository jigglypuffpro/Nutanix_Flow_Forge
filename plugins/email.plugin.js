export default {
  name: 'email',
  description: 'Mocks sending an email notification',
  
  validate(config) {
    if (!config.to || !config.subject || !config.body) {
      throw new Error('Email plugin requires "to", "subject", and "body" properties');
    }
  },
  
  async execute(config, api) {
    api.log(`[MOCK EMAIL] To: ${config.to} | Subject: ${config.subject}`);
    api.log(`[MOCK EMAIL] Body: ${config.body}`);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      output: `Email successfully sent to ${config.to}`,
      exitCode: 0
    };
  }
};
