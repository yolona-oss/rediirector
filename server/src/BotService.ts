import * as tg from 'telegraf'
import { EventEmitter } from 'events'
import { Database, Manager, Chat } from './database.js'
import { ChatServer } from './ChatService.js'
import { Config } from './Config.js'

interface Context extends tg.Context {
    manager: Manager
}

type TextContext = tg.NarrowedContext<Context, tg.Types.MountMap['text']>;
type Command = {
    (this: BotService, ctx: TextContext): Promise<void>;
    description: string;
    args: string;
}
const commands = (()=> {
    let start = <Command>async function(this: BotService, ctx: TextContext) {
        ctx.reply("Yo, how you are?");
        // ctx.replyWithSticker(this.stickers.welcoming);
    }

    let help = <Command>async function(this: BotService, ctx: TextContext) {
        let msg: string = "";
        Object.values(commands).forEach((cmd) => {
            msg += "/" + cmd.name + " - " + cmd.description + ". Arg: " + cmd.args + "\n";
        })
        ctx.reply(msg);
    }

    let chat_enter = <Command>async function(this: BotService, ctx: TextContext) {
        let chatHash = ctx.message.text.slice('chat_enter'.length);
        // avoiding ts warning
        if (this.chatService.enterChat(chatHash, ctx.manager)) {
            await ctx.manager.linkToChat(chatHash)
            ctx.reply("Now you are in chat with customer");
        } else {
            ctx.reply("Selected chat expired");
        }
    }

    let close = <Command>async function(this: BotService, ctx: TextContext) {
        if (ctx.manager.linkedChat) {
            await this.chatService.closeChat(ctx.manager.linkedChat);
            await ctx.manager.unlinkChat();
            ctx.reply("Chat successfuly closed");
        } else {
            ctx.reply("Close chat command will be avalible only after entering any chat");
        }
    }

    let leave = <Command>async function(this: BotService, ctx: TextContext) {
        if (ctx.manager.linkedChat) {
            ctx.reply("Chat successfuly leaved, " + (await Chat.findOne({ managerId: ctx.manager.userId }))!.initiator + " will wait for another manager");
            await this.chatService.leaveChat(ctx.manager.linkedChat);
            await ctx.manager.unlinkChat();
        } else {
            ctx.reply("Leave chat command will be avalible only after entering any chat");
        }
    }

    let history = <Command>async function(this: BotService, ctx: TextContext) {
        const max_tg_msg_len = 4096;
        if (ctx.manager.linkedChat) {
            let history_msg: string = "Chat history:";
            let chat = await Chat.findOne({ hash: ctx.manager.linkedChat });
            if (chat) {
                let history = await chat.getHistory();
                history.forEach(msg => {
                    if (history_msg.length >= max_tg_msg_len) {
                        ctx.reply(history_msg);
                        history_msg = ""
                    }
                    history_msg += "From: " + msg.message.from.name + "\n" + msg.message.text + "\n";
                })
            } else {
                ctx.reply("Cannot find chat");
            }
        } else {
            ctx.reply("You are not connected to chat");
        }
    }

    let setname = <Command>async function(this: BotService, ctx: TextContext) {
        let name = "";
        if (ctx.message && ctx.message.text) {
            name = String(ctx.message.text.slice('setname'.length+2)).trim();
        }
        if (name !== "") {
            await ctx.manager.setName(name);
            ctx.reply("Now your will called " + name);
        } else {
            ctx.reply('No string passed, try: "/setname The Emperor"');
        }
    }

    let updateavatar = <Command>async function(this: BotService, ctx: TextContext) {
        let photos = await ctx.telegram.getUserProfilePhotos(ctx.from.id, 0, 1);
        let file   = await ctx.telegram.getFile(photos.photos[0][0].file_id);
        let url    = await ctx.telegram.getFileLink(file.file_id);
        let l_file = await Database.files.saveFile(url.href, "avatars");
        if (l_file) {
            await ctx.manager.setAvatar(l_file.file_id);
        } else {
            ctx.reply("Loading error. Try another time");
        }
    }

    let chats = <Command>async function(this: BotService, ctx: TextContext) {
        ctx.reply("In dev");
    }

    let menu = <Command>async function(this: BotService, ctx: TextContext) {
        ctx.reply("In dev");
        if (ctx.manager.isAdmin) {

        } else {

        }
    }

    let goonline = <Command>async function(this: BotService, ctx: TextContext) {
        if (ctx.manager.linkedChat) {
            ctx.reply("You cannot change status while you are in chat");
        } else {
            await ctx.manager.setOnline(true);
            ctx.reply("You are online now");
            // ctx.replyWithSticker(this.stickers.happy)

            let pending = await Database.chats.findMany((ch) => { return !ch.managerId && ch.online && ch.waitingManager });
            if (pending.length > 0) {
                await ctx.reply("During your absence " + pending.length + " peoplec need your help");
                for (let chat of pending) {
                    ctx.reply("Incoming invetation from " + chat.initiator, this.createEnterChatMarkup(chat.hash));
                }
            }
        }
    }

    let gooffline = <Command>async function(this: BotService, ctx: TextContext) {
        if (ctx.manager.linkedChat) {
            ctx.reply("You cannot change status while you are in chat");
        } else {
            await ctx.manager.setOnline(false);
            ctx.reply("You are offline now");
            // ctx.replyWithSticker(this.stickers.sad);
        }
    }

    let status = <Command>async function(this: BotService, ctx: TextContext) {
        let chatLinkInfo: string = (ctx.manager.linkedChat ? " and you in chat" : "");
        ctx.reply("Your status: " + (ctx.manager.online ? "online" : "offline") + chatLinkInfo)
    }

    status.description = "get current status";
    status.args = "no";

    goonline.description = "change status to online";
    goonline.args = "no";

    gooffline.description = "change status to offline";
    gooffline.args = "no";

    menu.description = "show main inline menu";
    menu.args = "no";

    chats.description = "show chats inline menu";
    chats.args = "no";

    updateavatar.description = "update avatar to current profile avatar";
    updateavatar.args = "no";

    setname.description = "change displaing name to new";
    setname.args = "string";

    history.description = "show current chat history";
    history.args = "no";

    leave.description = "leave current chat";
    leave.args = "no";

    close.description = "close current chat";
    close.args = "no";

    chat_enter.description = "enter to chat";
    chat_enter.args = "chat UUID";

    start.description = "start chat with bot";
    start.args = "no";

    help.description = "show help message";
    help.args = "no";

    return {
        status,
        goonline,
        gooffline,
        menu,
        chats,
        updateavatar,
        setname,
        history,
        leave,
        close,
        chat_enter,
        start,
        help,
    }
})()

const cb_data = {
    approveRequest: 'approve_request',
    approveManager: 'approve_manager',
    rejectManager: 'reject_manager',
    chatEnter: 'chat_enter',
    chatDecline: 'chat_decline',
};

type CqContext = tg.NarrowedContext<Context & { match: RegExpExecArray; }, tg.Types.MountMap['callback_query']>;
let actions = (() => {

    async function approverequest(this: BotService, ctx: CqContext, next: () => void) {
        let id = ctx.match.input.slice(cb_data.approveRequest.length);
        let keyboard = tg.Markup.inlineKeyboard([ [
            {   text: "Approve",
                callback_data: cb_data.approveManager + " " + id },
            {   text: "Reject",
                callback_data: cb_data.rejectManager + " " + id }
        ] ])
        await ctx.telegram.sendMessage(Config().bot.admin_id, "Approve request from @" + ctx.from!.username,
                                       keyboard);
        next();
    }

    async function approvemanager(this: BotService, ctx: CqContext, next: () => void) {
        let userId = Number(ctx.match.input.slice(cb_data.approveManager.length));
        let member = await this.bot.telegram.getChatMember(userId, userId);
        await (new Manager({
            userId: userId,
            name: member.user.first_name + " " + member.user.last_name,
            avatar: (await Database.files.getDefaultAvatar()).file_id
        })).sync();

        await this.bot.telegram.sendMessage(userId, "Your request have been accepted. Now you are can use this bot");
        next();
    }

    async function rejectmanager(this: BotService, ctx: CqContext, next: () => void) {
        let userId = Number(ctx.match.input.slice(cb_data.rejectManager.length));
        await this.bot.telegram.sendMessage(userId, "Your request have been rejected");
        // this.bot.telegram.sendSticker(userId, this.stickers.evil);
        next();
    }

    async function chatenter(this: BotService, ctx: CqContext, next: () => void) {
        let chatHash = ctx.match.input.slice(cb_data.chatEnter.length+1);
        console.log("HASH", chatHash)
        // avoiding ts warning
        if (this.chatService.enterChat(chatHash, ctx.manager)) {
            await ctx.manager.linkToChat(chatHash);
            await ctx.reply("Now you are in chat with customer");
        } else {
            await ctx.reply("Selected chat expired");
        }
        next();
    }

    async function text(this: BotService, ctx: TextContext) {
        if (ctx.manager.linkedChat) {
            this.chatService.answerTo(ctx.manager.linkedChat, {
                id: 0, // deligate to chatService TODO use OMIT to remove this field
                stamp: new Date(ctx.message.date * 1000).getTime(),
                from: {
                    name: ctx.manager.name,
                    type: 'manager',
                    userid: ctx.manager.userId
                },
                text: ctx.message.text
            });
        } else {
            let msg = await ctx.reply("You are not connected to chat, those messages will be deleted");
            setTimeout(async () => {
                ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id);
                ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id);
            }, 5000);
        }
    }

    return {
        approverequest,
        approvemanager,
        rejectmanager,
        chatenter,
        text,
    }
})()

const csAction = (() => {

    async function managerrequest(this: BotService, chat: Chat) {
        if (chat.managerId) {
            await this.bot.telegram.sendMessage(chat.managerId, "Customer " + chat.initiator + " return to chat");
        } else {
            let online = await Database.managers.findMany({ online: true, linkedChat: null });
            for await (let m of online) {
                this.bot.telegram.sendMessage(m.userId, "Incoming chat invetation from " + chat.initiator, this.createEnterChatMarkup(chat.hash));
            }
        }
    }

    async function closed(this: BotService, args: any) {
        let { chat, waitReq } = args;
        if (chat.managerId) {
            if (waitReq) {
                this.bot.telegram.sendMessage(chat.managerId, "Client reloading page or something, you still can leave or close this chat");
            } else {
                this.bot.telegram.sendMessage(chat.managerId, "Client closed chat");
                await (await Manager.findOne({ userId: chat.managerId }))!.unlinkChat();
                await chat.unlinkManager();
            }
        }
    }

    async function message(this: BotService, args: any) {
        let { chat, message } = args;
        if (chat.managerId) {
            // this.bot.telegram.sendMessage(chat.managerId, message.from.name + ":\n" + message.text);
            this.bot.telegram.sendMessage(chat.managerId, chat.initiator + ":\n" + message.text);
        }
    }

    return {
        managerrequest,
        closed,
        message,
    }
})()

export class BotService extends EventEmitter {
    public readonly bot: tg.Telegraf<Context>;
    public readonly chatService: ChatServer;

    private running: boolean = false;

    public onStop: () => void = () => {}

    // private readonly stickers = {
    //     welcoming: "CAACAgIAAxkBAAEEh85iYatAqlMz81qfn7Dk303ummYrjwACGBEAAvE40EoZjSpXJ-H1-CQE",
    //     happy:     "CAACAgIAAxkBAAEEh9BiYatNE-M0LO7eJ6A8rERHIennowAC9A8AAuauOUpmEnHaU53szyQE",
    //     sad:       "CAACAgIAAxkBAAEEh9ZiYavBfd0mfaBWTzqMeBSYbwkB7wACjxMAAosj2UpwO-yY639C-iQE",
    //     evil:      "CAACAgIAAxkBAAEEh9JiYate-8ItpkQBSCowdGmwTHzR8wAC0hEAAjnxkUtIXF3Fd0t44iQE",
    //     verySad:   "CAACAgIAAxkBAAEEh9RiYaueiAN4zPax481xTRns1EYlRQAC0hAAAtOfOEp18SByrhUeJiQE",
    // }

    constructor() {
        super();
        this.chatService = new ChatServer();

        this.chatService.on('managerRequest', (arg) => csAction.managerrequest.call(this, arg));
        this.chatService.on('chatClosed',     (arg) => csAction.closed.call(this, arg));
        this.chatService.on('chatMessage',    (arg) => csAction.message.call(this, arg));

        this.bot = new tg.Telegraf(Config().bot.token);

        this.bot.use(async (ctx, next) => {
            let mngr = await Manager.findOne({ userId: ctx.from!.id })
            if (mngr) {
                ctx.manager = mngr;
                return next();
            } else if (ctx.updateType == 'callback_query') {
                let _ctx: CqContext = <CqContext>ctx;
                if (_ctx.match.input.includes(cb_data.approveRequest)) {
                    return next();
                }
            }
            await ctx.replyWithMarkdown("Welcome to rediirector bot. To start using bot you need to be aproved by bot administrator.\n" +
                                        "Click on button for send approve request",
                                            tg.Markup.inlineKeyboard([ [ { text: "Send", callback_data: cb_data.approveRequest + " " + ctx.from!.id  }, ] ]));
        })

        Object.values(commands).forEach(cmd =>
            this.bot.command(cmd.name, (ctx) => cmd.call(this,ctx))
        )

        this.bot.action(RegExp(cb_data.approveRequest + "*"), (ctx, next) => actions.approverequest.call(this, ctx, next));
        this.bot.action(RegExp(cb_data.approveManager + "*"), (ctx, next) => actions.approvemanager.call(this, ctx, next));
        this.bot.action(RegExp(cb_data.rejectManager + "*"),  (ctx, next) => actions.rejectmanager.call(this, ctx, next));
        this.bot.action(RegExp(cb_data.chatEnter + "*"),      (ctx, next) => actions.chatenter.call(this, ctx, next));

        // Its muts be declared after ALL commands!
        this.bot.on('text', actions.text.bind(this));
    }

    deconstructor() {
    }

    async start() {
        if (this.running) {
            return;
        }
        try {
            let adminExisted = true;
            let admin = await Database.managers.findOne({ userId: Config().bot.admin_id })
            if (!admin) {
                adminExisted = false;
                Database.managers.insertOne({
                    isAdmin: true,
                    name: "Admin",
                    userId: Config().bot.admin_id,
                    linkedChat: null,
                    online: false,
                    avatar: (await Database.files.getDefaultAvatar()).file_id
                })
            }
            await this.bot.launch();
            this.running = true;
            if (adminExisted) {
                for (let mngr of await Manager.findMany({})) {
                    this.bot.telegram.sendMessage(mngr.userId, "Service now online");
                    // this.bot.telegram.sendSticker(mngr.userId, this.stickers.happy);
                }
            }
            console.log("Telegram-bot service started");

            await this.chatService.start();
        } catch(e) {
            throw e;
        }
    }

    async stop() {
        if (!this.running) return;
        this.running = false;
        await Database.managers.updateMany({ online: true }, { online: false, linkedChat: null });
        await Database.managers.save();
        await this.chatService.stop();
        let mngrs = Database.managers.documents;
        for (let m of mngrs) {
            await this.bot.telegram.sendMessage(m.userId, "Service going offline, your status will be reseted to offline");
            // await this.bot.telegram.sendSticker(m.userId, this.stickers.verySad);
        }
        this.bot.stop();
        await this.onStop();
    }

    createEnterChatMarkup(hash: string) {
        return tg.Markup.inlineKeyboard([ tg.Markup.button.callback("Accept", cb_data.chatEnter + " " + hash),
                                          tg.Markup.button.callback("Decline", cb_data.chatDecline + " " + hash) ])
    }
}
