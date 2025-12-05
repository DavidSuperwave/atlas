import { createClient } from '@supabase/supabase-js';
import { enrichLead, MailTesterResponse } from './mailtester';
import { deductCredits, checkCredits } from './credits';
import { apiKeyPool, ApiKeyPool } from './api-key-pool';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Rate limit: 170 emails per 30 seconds = ~176ms per request
// Using 180ms to be safe
const RATE_LIMIT_DELAY = 180;

// Mail Tester Ninja Ultimate Plan limits
const EMAILS_PER_30_SECONDS = 170;
const DAILY_LIMIT = 500000; // 500k emails per day

// Maximum concurrent workers (one per API key)
const MAX_CONCURRENT_WORKERS = 10;

interface QueueItem {
    type: 'lead' | 'bulk';
    leadId?: string; // For lead enrichment
    jobId?: string; // For bulk verification
    permutations?: { email: string; pattern: string }[]; // For lead enrichment
    emails?: string[]; // For bulk verification
    userId?: string; // User ID for credit deduction
    priority?: number; // Higher = processed first
    onComplete?: () => void; // Callback when processing is done
    onError?: (error: any) => void; // Callback when processing fails
}

interface PermutationResult {
    email: string;
    pattern: string;
    status: string;
    error?: string;
    code?: string;
    mx?: string;
    message?: string;
}

interface WorkerState {
    id: number;
    apiKey: string;
    keyName: string;
    isProcessing: boolean;
    lastRequestTime: number;
    processedCount: number;
}

/**
 * Verification Queue with Multi-Key Support
 * 
 * Manages email verification with support for multiple API keys,
 * enabling parallel processing for higher throughput.
 * 
 * SCALING:
 * - 1 key: 170 emails/30s = ~340/minute
 * - 3 keys: 510 emails/30s = ~1,020/minute
 * - 5 keys: 850 emails/30s = ~1,700/minute
 */
export class VerificationQueue {
    private static instance: VerificationQueue;
    private queue: QueueItem[] = [];
    private workers: WorkerState[] = [];
    private isInitialized = false;
    private keyPool: ApiKeyPool;

    // Legacy single-key support (backward compatible)
    private legacyApiKey: string;
    private legacyLastRequestTime = 0;
    private isProcessing = false;

    private constructor() {
        this.keyPool = apiKeyPool;
        this.legacyApiKey = process.env.MAILTESTER_API_KEY || '';
        this.initializeWorkers();
    }

    /**
     * Initialize workers based on available API keys
     */
    private initializeWorkers(): void {
        const keyCount = this.keyPool.getKeyCount();

        if (keyCount === 0) {
            // Fall back to legacy single-key mode
            if (this.legacyApiKey) {
                console.log('[VERIFICATION-QUEUE] Using legacy single-key mode');
                this.workers = [{
                    id: 0,
                    apiKey: this.legacyApiKey,
                    keyName: 'primary',
                    isProcessing: false,
                    lastRequestTime: 0,
                    processedCount: 0
                }];
            } else {
                console.warn('[VERIFICATION-QUEUE] No API keys configured!');
                this.workers = [];
            }
        } else {
            // Multi-key mode: create one worker per key
            console.log(`[VERIFICATION-QUEUE] Initializing ${keyCount} workers for parallel processing`);

            const keyNames = this.keyPool.getKeyNames();
            this.workers = keyNames.slice(0, MAX_CONCURRENT_WORKERS).map((name, index) => ({
                id: index,
                apiKey: '', // Will be acquired when processing
                keyName: name,
                isProcessing: false,
                lastRequestTime: 0,
                processedCount: 0
            }));
        }

        this.isInitialized = true;

        // Log capacity
        const capacity = this.keyPool.getTotalCapacity();
        console.log(`[VERIFICATION-QUEUE] Capacity: ${capacity.requestsPerMinute} emails/minute, ${capacity.requestsPerHour} emails/hour`);
    }

    static getInstance(): VerificationQueue {
        if (!VerificationQueue.instance) {
            VerificationQueue.instance = new VerificationQueue();
        }
        return VerificationQueue.instance;
    }

    /**
     * Add item to queue
     */
    /**
     * Add item to queue
     * @param item Queue item to add
     * @param waitForCompletion If true, returns a promise that resolves when processing is complete
     */
    async add(item: QueueItem, waitForCompletion = false): Promise<void> {
        // Ensure workers are initialized
        if (!this.isInitialized) {
            console.warn('[VERIFICATION-QUEUE] Workers not initialized, reinitializing...');
            this.initializeWorkers();
        }

        const promise = new Promise<void>((resolve, reject) => {
            if (waitForCompletion) {
                item.onComplete = resolve;
                item.onError = reject;
            }
        });

        // Add with priority (optional)
        if (item.priority !== undefined) {
            // Insert in priority order
            const insertIndex = this.queue.findIndex(q => (q.priority || 0) < item.priority!);
            if (insertIndex === -1) {
                this.queue.push(item);
            } else {
                this.queue.splice(insertIndex, 0, item);
            }
        } else {
            this.queue.push(item);
        }

        if (item.type === 'lead') {
            console.log(`[VERIFICATION-QUEUE] Added lead ${item.leadId} with ${item.permutations?.length || 0} permutations (Queue: ${this.queue.length}, Workers: ${this.workers.length})`);
        } else {
            console.log(`[VERIFICATION-QUEUE] Added bulk job ${item.jobId} with ${item.emails?.length || 0} emails (Queue: ${this.queue.length}, Workers: ${this.workers.length})`);
        }

        // Start processing if not already running
        this.startProcessing().catch(error => {
            console.error('[VERIFICATION-QUEUE] Error starting processing:', error);
        });

        if (waitForCompletion) {
            return promise;
        }
    }

    /**
     * Start processing queue with all available workers
     */
    private async startProcessing(): Promise<void> {
        if (this.workers.length === 0) {
            console.error('[VERIFICATION-QUEUE] No workers available!');
            console.error('[VERIFICATION-QUEUE] Check API key configuration.');
            console.error('[VERIFICATION-QUEUE] Key pool has keys:', this.keyPool.getKeyCount());
            console.error('[VERIFICATION-QUEUE] Legacy key available:', !!this.legacyApiKey);

            // Try to reinitialize workers
            console.log('[VERIFICATION-QUEUE] Attempting to reinitialize workers...');
            this.initializeWorkers();

            if (this.workers.length === 0) {
                console.error('[VERIFICATION-QUEUE] Still no workers after reinitialization. Cannot process queue.');
                return;
            }
        }

        if (this.queue.length === 0) {
            console.log('[VERIFICATION-QUEUE] Queue is empty, nothing to process');
            return;
        }

        console.log(`[VERIFICATION-QUEUE] Starting processing: ${this.queue.length} items in queue, ${this.workers.length} workers available`);

        // Find idle workers and start them (fire-and-forget but with error handling)
        let workersStarted = 0;
        for (const worker of this.workers) {
            if (!worker.isProcessing && this.queue.length > 0) {
                workersStarted++;
                // Start processing in background - don't await to allow parallel processing
                this.processWithWorker(worker).catch(error => {
                    console.error(`[VERIFICATION-QUEUE] Worker ${worker.id} processing error:`, error);
                    worker.isProcessing = false; // Reset flag on error
                    // Try to continue processing if queue still has items
                    if (this.queue.length > 0) {
                        console.log(`[VERIFICATION-QUEUE] Retrying processing after worker ${worker.id} error...`);
                        setTimeout(() => this.startProcessing(), 1000);
                    }
                });
            }
        }

        if (workersStarted === 0 && this.queue.length > 0) {
            console.warn(`[VERIFICATION-QUEUE] No idle workers available but queue has ${this.queue.length} items. All workers may be busy.`);
        } else {
            console.log(`[VERIFICATION-QUEUE] Started ${workersStarted} worker(s) for processing`);
        }
    }

    /**
     * Process queue items with a specific worker
     */
    private async processWithWorker(worker: WorkerState): Promise<void> {
        if (worker.isProcessing) return;

        worker.isProcessing = true;

        try {
            while (this.queue.length > 0) {
                const item = this.queue.shift();
                if (!item) break;

                // Acquire API key for this worker
                try {
                    worker.apiKey = await this.keyPool.acquireKey();
                    worker.keyName = this.keyPool.getKeyName(worker.apiKey);
                } catch (keyError) {
                    // Put item back in queue
                    this.queue.unshift(item);
                    console.error(`[WORKER-${worker.id}] Failed to acquire API key:`, keyError);
                    await new Promise(r => setTimeout(r, 1000)); // Wait before retrying
                    continue;
                }

                console.log(`[WORKER-${worker.id}] Processing with key: ${worker.keyName}`);

                try {
                    if (item.type === 'lead') {
                        await this.verifyAndSaveWithWorker(item, worker);
                    } else {
                        await this.processBulkJobWithWorker(item, worker);
                    }
                    worker.processedCount++;
                    item.onComplete?.();
                } catch (error) {
                    if (item.type === 'lead') {
                        console.error(`[WORKER-${worker.id}] Error processing lead ${item.leadId}:`, error);
                        await this.updateLeadWithError(item.leadId!, error);
                    } else {
                        console.error(`[WORKER-${worker.id}] Error processing bulk job ${item.jobId}:`, error);
                        await this.updateBulkJobWithError(item.jobId!, error);
                    }
                    item.onError?.(error);
                } finally {
                    // Release the API key
                    this.keyPool.releaseKey(worker.apiKey);
                }
            }
        } finally {
            worker.isProcessing = false;
        }
    }

    /**
     * Verify and save lead with a specific worker
     */
    private async verifyAndSaveWithWorker(item: QueueItem, worker: WorkerState): Promise<void> {
        console.log(`[WORKER-${worker.id}] Processing lead ${item.leadId}...`);

        if (!worker.apiKey) {
            const error = 'API key not available';
            console.error(`[WORKER-${worker.id}] Cannot verify:`, error);
            await this.updateLeadWithError(item.leadId!, new Error(error));
            return;
        }

        // Check if user has credits before processing
        if (item.userId) {
            const hasCredits = await checkCredits(item.userId, 1);
            if (!hasCredits) {
                console.log(`[WORKER-${worker.id}] User ${item.userId} has insufficient credits`);
                await supabase
                    .from('leads')
                    .update({
                        verification_status: 'error',
                        verification_data: {
                            error: 'Insufficient credits',
                            error_timestamp: new Date().toISOString()
                        }
                    })
                    .eq('id', item.leadId);
                return;
            }
        }

        let bestResult: MailTesterResponse | null = null;
        let bestStatus = 'invalid';
        let bestPattern = '';
        const checkedPerms: PermutationResult[] = [];
        const errors: string[] = [];

        for (const perm of item.permutations || []) {
            // Enforce rate limit for this key
            const delay = this.keyPool.getDelayForKey(worker.apiKey);
            if (delay > 0) {
                await new Promise(r => setTimeout(r, delay));
            }

            console.log(`[WORKER-${worker.id}] Verifying: ${perm.email}`);

            try {
                const result = await enrichLead(perm.email, worker.apiKey);

                // Track usage
                this.keyPool.trackUsage(worker.apiKey);
                worker.lastRequestTime = Date.now();

                let status = 'invalid';
                if (result.code === 'ok') status = 'valid';
                else if (result.code === 'mb' || result.message?.toLowerCase().includes('catch')) status = 'catchall';

                checkedPerms.push({
                    email: perm.email,
                    pattern: perm.pattern,
                    status: status,
                    code: result.code,
                    mx: result.mx,
                    message: result.message
                });

                if (status === 'valid') {
                    bestResult = result;
                    bestStatus = 'valid';
                    bestPattern = perm.pattern;
                    console.log(`[WORKER-${worker.id}] ✓ Found valid email: ${perm.email}`);
                    break; // Stop on first valid
                } else if (status === 'catchall') {
                    if (bestStatus !== 'valid') {
                        bestResult = result;
                        bestStatus = 'catchall';
                        bestPattern = perm.pattern;
                    }
                }
            } catch (e) {
                const errorMessage = e instanceof Error ? e.message : 'Unknown error';
                console.error(`[WORKER-${worker.id}] Verification failed for ${perm.email}:`, errorMessage);
                errors.push(`${perm.email}: ${errorMessage}`);

                checkedPerms.push({
                    email: perm.email,
                    pattern: perm.pattern,
                    status: 'error',
                    error: errorMessage
                });
            }
        }

        // Determine provider
        let provider = 'unknown';
        if (bestResult?.mx) {
            const mx = bestResult.mx.toLowerCase();
            if (mx.includes('google') || mx.includes('gmail')) provider = 'google';
            else if (mx.includes('outlook') || mx.includes('protection.outlook')) provider = 'outlook';
            else provider = 'smtp';
        }

        // Build verification data
        const verificationData: Record<string, unknown> = {
            permutations_checked: checkedPerms,
            total_checked: checkedPerms.length,
            completed_at: new Date().toISOString(),
            worker_id: worker.id,
            api_key_used: worker.keyName
        };

        if (errors.length > 0) {
            verificationData.errors = errors;
        }

        if (bestResult) {
            verificationData.best_match = {
                email: bestResult.email,
                pattern: bestPattern,
                status: bestStatus
            };
        }

        // Deduct credits only on successful enrichment
        let creditsUsed = 0;
        if (bestStatus === 'valid' && item.userId) {
            try {
                await deductCredits(item.userId, 1, item.leadId, `Email enrichment: ${bestResult?.email}`);
                creditsUsed = 1;
                console.log(`[WORKER-${worker.id}] Deducted 1 credit from user ${item.userId}`);
            } catch (creditError) {
                console.error('[WORKER-${worker.id}] Failed to deduct credits:', creditError);
            }
        }

        // Update Supabase
        const updateData: Record<string, unknown> = {
            verification_status: bestStatus,
            verification_data: verificationData,
            provider: provider,
            email_validity: bestResult?.code || null,
            mx_record: bestResult?.mx || null,
            inbox_type: bestResult?.message || null,
            credits_used: creditsUsed,
            api_key_used: worker.keyName
        };

        if (bestStatus === 'valid' || bestStatus === 'catchall') {
            updateData.email = bestResult?.email;
        }

        const { error } = await supabase
            .from('leads')
            .update(updateData)
            .eq('id', item.leadId);

        if (error) {
            console.error(`[WORKER-${worker.id}] Error updating lead in DB:`, error);
        } else {
            console.log(`[WORKER-${worker.id}] Lead ${item.leadId} updated: ${bestStatus} (${checkedPerms.length} checked)`);

            // EMAIL-BASED DUPLICATE DETECTION
            // Only check for duplicates when email is VALID (not catchall/invalid)
            // No point checking invalid emails - they're not usable anyway
            if (bestResult?.email && bestStatus === 'valid') {
                await this.checkEmailDuplicate(item.leadId!, bestResult.email, worker.id);
            }
        }
    }

    /**
     * Check if the enriched email already exists in another lead
     * If so, mark this lead as a duplicate
     * 
     * This is more accurate than name-based duplicate detection because:
     * - Names aren't unique ("John Smith" could be different people)
     * - Email IS unique and definitive
     */
    private async checkEmailDuplicate(leadId: string, email: string, workerId: number): Promise<void> {
        try {
            // Find any existing lead with this email that was created BEFORE this one
            const { data: currentLead } = await supabase
                .from('leads')
                .select('created_at')
                .eq('id', leadId)
                .single();

            if (!currentLead) return;

            const { data: existingLead } = await supabase
                .from('leads')
                .select('id, email, first_name, last_name, company_name')
                .eq('email', email)
                .lt('created_at', currentLead.created_at) // Only older leads
                .neq('id', leadId) // Not itself
                .limit(1)
                .single();

            if (existingLead) {
                // Mark this lead as a duplicate
                const { error } = await supabase
                    .from('leads')
                    .update({
                        is_duplicate: true,
                        original_lead_id: existingLead.id
                    })
                    .eq('id', leadId);

                if (!error) {
                    console.log(`[WORKER-${workerId}] ✓ Email duplicate detected: ${email} (original: ${existingLead.id})`);
                }
            }
        } catch (error) {
            // Don't fail the enrichment if duplicate check fails
            console.error(`[WORKER-${workerId}] Error checking email duplicate:`, error);
        }
    }

    /**
     * Process bulk job with a specific worker
     */
    private async processBulkJobWithWorker(item: QueueItem, worker: WorkerState): Promise<void> {
        const jobId = item.jobId!;
        const userId = item.userId!;

        console.log(`[WORKER-${worker.id}] Processing bulk job ${jobId}...`);

        if (!worker.apiKey) {
            const error = 'API key not available';
            console.error(`[WORKER-${worker.id}] Cannot verify:`, error);
            await this.updateBulkJobWithError(jobId, new Error(error));
            return;
        }

        try {
            const { data: pendingResults, error: fetchError } = await supabase
                .from('email_verification_results')
                .select('*')
                .eq('job_id', jobId)
                .eq('status', 'pending')
                .order('created_at', { ascending: true });

            if (fetchError || !pendingResults) {
                throw new Error('Failed to fetch pending results');
            }

            let creditsUsed = 0;

            for (const result of pendingResults) {
                // Enforce rate limit for this key
                const delay = this.keyPool.getDelayForKey(worker.apiKey);
                if (delay > 0) {
                    await new Promise(r => setTimeout(r, delay));
                }

                try {
                    const verificationResult = await enrichLead(result.email, worker.apiKey);

                    // Track usage
                    this.keyPool.trackUsage(worker.apiKey);

                    let status = 'invalid';
                    if (verificationResult.code === 'ok') {
                        status = 'valid';
                    } else if (verificationResult.code === 'mb' ||
                        verificationResult.message?.toLowerCase().includes('catch')) {
                        status = 'catchall';
                    }

                    await supabase
                        .from('email_verification_results')
                        .update({
                            status: status,
                            mx_record: verificationResult.mx,
                            message: verificationResult.message,
                            code: verificationResult.code,
                            verified_at: new Date().toISOString(),
                            api_key_used: worker.keyName
                        })
                        .eq('id', result.id);

                    if (status === 'valid') {
                        try {
                            await deductCredits(userId, 1, undefined, `Email verification: ${result.email}`);
                            creditsUsed++;
                        } catch (creditError) {
                            console.error(`[WORKER-${worker.id}] Failed to deduct credit:`, creditError);
                        }
                    }

                    await this.updateBulkJobStats(jobId, creditsUsed);

                } catch (verifyError) {
                    console.error(`[WORKER-${worker.id}] Error verifying ${result.email}:`, verifyError);

                    await supabase
                        .from('email_verification_results')
                        .update({
                            status: 'error',
                            message: verifyError instanceof Error ? verifyError.message : 'Verification failed',
                            verified_at: new Date().toISOString(),
                        })
                        .eq('id', result.id);
                }
            }

            await supabase
                .from('email_verification_jobs')
                .update({
                    status: 'completed',
                    credits_used: creditsUsed,
                    completed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', jobId);

            console.log(`[WORKER-${worker.id}] Bulk job ${jobId} completed. Credits: ${creditsUsed}`);

        } catch (error) {
            console.error(`[WORKER-${worker.id}] Error processing bulk job:`, error);
            await this.updateBulkJobWithError(jobId, error);
        }
    }

    // ==================== Helper Methods ====================

    private async updateLeadWithError(leadId: string, error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await supabase
            .from('leads')
            .update({
                verification_status: 'error',
                verification_data: {
                    error: errorMessage,
                    error_timestamp: new Date().toISOString()
                }
            })
            .eq('id', leadId);
    }

    private async updateBulkJobWithError(jobId: string, error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await supabase
            .from('email_verification_jobs')
            .update({
                status: 'failed',
                error_message: errorMessage,
                updated_at: new Date().toISOString()
            })
            .eq('id', jobId);
    }

    private async updateBulkJobStats(jobId: string, creditsUsed: number) {
        const { data: counts } = await supabase
            .from('email_verification_results')
            .select('status')
            .eq('job_id', jobId);

        if (counts) {
            const stats = {
                processed_emails: counts.filter(r => r.status !== 'pending').length,
                valid_count: counts.filter(r => r.status === 'valid').length,
                catchall_count: counts.filter(r => r.status === 'catchall').length,
                invalid_count: counts.filter(r => r.status === 'invalid' || r.status === 'error').length,
                credits_used: creditsUsed,
                updated_at: new Date().toISOString(),
            };

            await supabase
                .from('email_verification_jobs')
                .update(stats)
                .eq('id', jobId);
        }
    }

    // ==================== Public API ====================

    getQueueSize(): number {
        return this.queue.length;
    }

    private getTotalPendingEmails(): number {
        return this.queue.reduce((total, item) => {
            if (item.type === 'lead') {
                return total + (item.permutations?.length || 0);
            } else {
                return total + (item.emails?.length || 0);
            }
        }, 0);
    }

    /**
     * Get comprehensive queue and worker stats
     */
    getQueueStats(): {
        queueSize: number;
        totalPendingEmails: number;
        isProcessing: boolean;
        estimatedTimeSeconds: number;
        estimatedTimeFormatted: string;
        workers: {
            id: number;
            keyName: string;
            isProcessing: boolean;
            processedCount: number;
        }[];
        apiKeyStats: ReturnType<ApiKeyPool['getStats']>;
        capacity: ReturnType<ApiKeyPool['getTotalCapacity']>;
    } {
        const queueSize = this.queue.length;
        const totalPendingEmails = this.getTotalPendingEmails();
        const activeWorkers = this.workers.filter(w => w.isProcessing).length;

        // Estimate time based on parallel processing
        const effectiveWorkers = Math.max(1, activeWorkers || this.workers.length);
        const estimatedTimeSeconds = Math.ceil(
            (totalPendingEmails * RATE_LIMIT_DELAY) / (1000 * effectiveWorkers)
        );

        let estimatedTimeFormatted = '';
        if (estimatedTimeSeconds < 60) {
            estimatedTimeFormatted = `${estimatedTimeSeconds}s`;
        } else if (estimatedTimeSeconds < 3600) {
            const minutes = Math.floor(estimatedTimeSeconds / 60);
            const seconds = estimatedTimeSeconds % 60;
            estimatedTimeFormatted = `${minutes}m ${seconds}s`;
        } else {
            const hours = Math.floor(estimatedTimeSeconds / 3600);
            const minutes = Math.floor((estimatedTimeSeconds % 3600) / 60);
            estimatedTimeFormatted = `${hours}h ${minutes}m`;
        }

        return {
            queueSize,
            totalPendingEmails,
            isProcessing: this.workers.some(w => w.isProcessing),
            estimatedTimeSeconds,
            estimatedTimeFormatted,
            workers: this.workers.map(w => ({
                id: w.id,
                keyName: w.keyName,
                isProcessing: w.isProcessing,
                processedCount: w.processedCount
            })),
            apiKeyStats: this.keyPool.getStats(),
            capacity: this.keyPool.getTotalCapacity()
        };
    }

    static getRateLimitInfo(): {
        emailsPer30Seconds: number;
        dailyLimit: number;
        delayBetweenRequestsMs: number;
        maxEmailsPerSecond: number;
    } {
        return {
            emailsPer30Seconds: EMAILS_PER_30_SECONDS,
            dailyLimit: DAILY_LIMIT,
            delayBetweenRequestsMs: RATE_LIMIT_DELAY,
            maxEmailsPerSecond: Math.floor(1000 / RATE_LIMIT_DELAY)
        };
    }
}

export const verificationQueue = VerificationQueue.getInstance();
