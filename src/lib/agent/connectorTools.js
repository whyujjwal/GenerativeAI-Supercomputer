import * as backendClient from './backendClient.js';

/**
 * @param {{ slack?: boolean, google?: boolean, notion?: boolean }} status
 * @returns {{ definitions: Array<Object>, handlers: Record<string, Function> }}
 */
export function buildConnectorTools(status = {}) {
    const definitions = [];
    const handlers = {};

    if (status.slack) {
        definitions.push({
            name: 'slack_post_message',
            description: 'Post a message to a Slack channel.',
            parameters: {
                type: 'object',
                properties: {
                    channel: { type: 'string', description: 'Slack channel ID or name (e.g. #general).' },
                    text: { type: 'string', description: 'Message text to post.' },
                },
                required: ['channel', 'text'],
            },
        });

        handlers.slack_post_message = async (args = {}) => {
            const res = await backendClient.call('slack', 'postMessage', {
                channel: args.channel,
                text: args.text,
            });
            if (res.disabled) {
                return { ok: false, error: 'Backend connector is not configured' };
            }
            if (!res.ok) {
                return { ok: false, error: res.error || 'Slack post failed' };
            }
            return { ok: true, result: res.result };
        };
    }

    if (status.google) {
        definitions.push({
            name: 'drive_upload_file',
            description: 'Upload a file to Google Drive from a public URL.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Filename for the Drive upload.' },
                    mimeType: { type: 'string', description: 'MIME type (e.g. image/png).' },
                    contentUrl: { type: 'string', description: 'Public URL of the file content to upload.' },
                },
                required: ['name', 'contentUrl'],
            },
        });

        definitions.push({
            name: 'gmail_send_email',
            description: 'Send a plain-text email via Gmail.',
            parameters: {
                type: 'object',
                properties: {
                    to: { type: 'string', description: 'Recipient email address.' },
                    subject: { type: 'string', description: 'Email subject line.' },
                    body: { type: 'string', description: 'Plain-text email body.' },
                },
                required: ['to', 'subject', 'body'],
            },
        });

        handlers.drive_upload_file = async (args = {}) => {
            const res = await backendClient.call('google', 'drive.upload', {
                name: args.name,
                mimeType: args.mimeType,
                contentUrl: args.contentUrl,
            });
            if (res.disabled) {
                return { ok: false, error: 'Backend connector is not configured' };
            }
            if (!res.ok) {
                return { ok: false, error: res.error || 'Drive upload failed' };
            }
            return { ok: true, result: res.result };
        };

        handlers.gmail_send_email = async (args = {}) => {
            const res = await backendClient.call('google', 'gmail.send', {
                to: args.to,
                subject: args.subject,
                body: args.body,
            });
            if (res.disabled) {
                return { ok: false, error: 'Backend connector is not configured' };
            }
            if (!res.ok) {
                return { ok: false, error: res.error || 'Gmail send failed' };
            }
            return { ok: true, result: res.result };
        };
    }

    if (status.notion) {
        definitions.push({
            name: 'notion_create_page',
            description: 'Create a Notion page under a parent page.',
            parameters: {
                type: 'object',
                properties: {
                    parentId: { type: 'string', description: 'Parent Notion page ID.' },
                    title: { type: 'string', description: 'Title for the new page.' },
                    contentMarkdown: { type: 'string', description: 'Page body as markdown paragraphs.' },
                },
                required: ['parentId', 'title'],
            },
        });

        handlers.notion_create_page = async (args = {}) => {
            const res = await backendClient.call('notion', 'createPage', {
                parentId: args.parentId,
                title: args.title,
                contentMarkdown: args.contentMarkdown,
            });
            if (res.disabled) {
                return { ok: false, error: 'Backend connector is not configured' };
            }
            if (!res.ok) {
                return { ok: false, error: res.error || 'Notion page creation failed' };
            }
            return { ok: true, result: res.result };
        };
    }

    return { definitions, handlers };
}
