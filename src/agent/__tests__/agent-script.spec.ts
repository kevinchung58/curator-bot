// Mock global fetch
global.fetch = jest.fn();

// Mock robots-parser
import robotsParser from 'robots-parser';
const mockIsAllowed = jest.fn();
jest.mock('robots-parser', () => jest.fn(() => ({
  isAllowed: mockIsAllowed,
  getSitemaps: jest.fn(() => Promise.resolve([])),
})));

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
};
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

// Mock AI processing module
import * as aiDev from '../../ai/dev';
const mockTriggerAIProcessing = jest.fn();
jest.mock('../../ai/dev', () => ({
  triggerAIProcessing: mockTriggerAIProcessing,
}));

// Mock nodemailer
const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({
  sendMail: mockSendMail,
  // verify: jest.fn().mockResolvedValue(true), // If we were to use verify
}));
jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}));


// Spy on and mock functions from agent-script itself
import * as agentScript from '../agent-script';

const mockInitializeSupabaseClient = jest.spyOn(agentScript, 'initializeSupabaseClient');
const mockFetchStrategiesFromSupabase = jest.spyOn(agentScript, 'fetchStrategiesFromSupabase');
const mockCheckForDuplicates = jest.spyOn(agentScript, 'checkForDuplicates');
const mockFetchWebContent = jest.spyOn(agentScript, 'fetchWebContent');
const mockUpdateSupabaseRecord = jest.spyOn(agentScript, 'updateSupabaseRecord');
// sendNotification will be tested directly, so we use its actual implementation
const actualSendNotification = agentScript.sendNotification;
const mockExtractMainContent = jest.spyOn(agentScript, 'extractMainContent');


// Import the main function to test
import { runAgent, getRobotsTxtUrl, sendNotification } from '../agent-script';


describe('Agent Script Utilities, Interactions & Orchestration', () => {

  // --- Environment and Console Spies Setup ---
  const originalEnv = { ...process.env };
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules(); // Clears cache for modules, useful if they read env vars at load time
    process.env = { ...originalEnv }; // Reset to original or a defined clean state

    // Clear all mocks and spies
    mockInitializeSupabaseClient.mockClear();
    mockFetchStrategiesFromSupabase.mockClear();
    mockCheckForDuplicates.mockClear();
    mockFetchWebContent.mockClear();
    mockTriggerAIProcessing.mockClear();
    mockUpdateSupabaseRecord.mockClear();
    // mockSendNotification (if it were a spy) would be cleared here. We test actual sendNotification.
    mockExtractMainContent.mockClear();

    mockSupabaseClient.from.mockClear().mockReturnThis();
    mockSupabaseClient.select.mockClear().mockReturnThis();
    mockSupabaseClient.insert.mockClear().mockResolvedValue({ error: null, data: [{ id: 'new-db-id' }] } as any);
    mockSupabaseClient.update.mockClear().mockReturnThis();
    mockSupabaseClient.eq.mockClear().mockReturnThis();

    (global.fetch as jest.Mock).mockReset();
    mockIsAllowed.mockReset();
    mockCreateTransport.mockClear();
    mockSendMail.mockClear();

    // Setup console spies
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console spies to prevent interference between test suites if this file grows
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
     jest.useRealTimers();
  });

  afterAll(() => {
    process.env = originalEnv; // Restore original env after all tests in this file
    jest.restoreAllMocks(); // Restore all mocks (includes console spies if not already done)
  });


  // --- Tests for sendNotification ---
  describe('sendNotification', () => {
    const testSubject = 'Test Subject';
    const testBody = 'Test Body\nWith newlines.';

    const-emailConfig = {
        EMAIL_HOST: 'smtp.example.com',
        EMAIL_PORT: '587',
        EMAIL_USER: 'user@example.com',
        EMAIL_PASS: 'password',
        EMAIL_SECURE: 'false',
        NOTIFICATION_EMAIL_FROM: 'agent@example.com',
        NOTIFICATION_EMAIL_TO: 'admin@example.com',
    };

    it('should send email successfully with all configurations set', async () => {
      process.env = { ...process.env, ...emailConfig };
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' });

      await sendNotification(testSubject, testBody, true);

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('🔴 CRITICAL ERROR ALERT 🔴'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Subject: ${testSubject}`));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Body:\n${testBody}`));

      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: emailConfig.EMAIL_HOST,
        port: 587,
        secure: false,
        auth: { user: emailConfig.EMAIL_USER, pass: emailConfig.EMAIL_PASS },
        logger: undefined, // Not in test env by default
        debug: undefined,  // Not in test env by default
      });
      expect(mockSendMail).toHaveBeenCalledWith({
        from: `Content Agent <${emailConfig.NOTIFICATION_EMAIL_FROM}>`,
        to: emailConfig.NOTIFICATION_EMAIL_TO,
        subject: `Content Agent (CRITICAL): ${testSubject}`,
        text: testBody,
        html: `<p>${testBody.replace(/\n/g, '<br>')}</p>`,
      });
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Notification email sent successfully.'));
    });

    it('should log warning and not send email if essential config is missing', async () => {
      process.env = { ...process.env, ...emailConfig, EMAIL_HOST: undefined }; // Missing EMAIL_HOST

      await sendNotification(testSubject, testBody, false);

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('🟡 WARNING 🟡'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Subject: ${testSubject}`));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Email notification functionality is disabled'));
      expect(mockCreateTransport).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should handle email sending failure (sendMail throws error)', async () => {
      process.env = { ...process.env, ...emailConfig };
      const sendMailError = new Error('SMTP Connection Error');
      mockSendMail.mockRejectedValueOnce(sendMailError);

      await sendNotification(testSubject, testBody, true);

      expect(mockCreateTransport).toHaveBeenCalledTimes(1);
      expect(mockSendMail).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to send notification email via Nodemailer.');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Email Sending Error Details:', sendMailError.message);
    });

    it('should correctly reflect isCritical=false in email subject and console log', async () => {
      process.env = { ...process.env, ...emailConfig };
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id-warning' });

      await sendNotification(testSubject, testBody, false); // isCritical = false

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('🟡 WARNING 🟡')); // console log for warning
      expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
        subject: `Content Agent (WARNING): ${testSubject}`, // Email subject
      }));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Notification email sent successfully.'));
    });

    it('should use port 465 and secure:true if EMAIL_SECURE is "true"', async () => {
        process.env = { ...process.env, ...emailConfig, EMAIL_PORT: '465', EMAIL_SECURE: 'true' };
        mockSendMail.mockResolvedValueOnce({ messageId: 'test-secure' });

        await sendNotification(testSubject, testBody);

        expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({
            port: 465,
            secure: true,
        }));
    });
  });

  // --- Placeholder for other test suites from previous steps ---
  describe('getRobotsTxtUrl (Placeholder)', () => {it('exists', () => expect(getRobotsTxtUrl).toBeDefined());});
  describe('Actual extractMainContent (Placeholder)', () => {it('exists', () => expect(agentScript.extractMainContent).toBeDefined());});
  describe('fetchWebContent (Placeholder)', () => {it('exists', () => expect(agentScript.fetchWebContent).toBeDefined());});
  describe('initializeSupabaseClient (Placeholder)', () => {it('exists', () => expect(initializeSupabaseClient).toBeDefined());});
  describe('fetchStrategiesFromSupabase (Placeholder)', () => {it('exists', () => expect(fetchStrategiesFromSupabase).toBeDefined());});
  describe('checkForDuplicates (Placeholder)', () => {it('exists', () => expect(checkForDuplicates).toBeDefined());});
  describe('updateSupabaseRecord (Placeholder)', () => {it('exists', () => expect(updateSupabaseRecord).toBeDefined());});
  describe('Agent Script Orchestration - runAgent (Placeholder)', () => {it('exists', () => expect(runAgent).toBeDefined());});

});
