// Discord.js mock for testing
class MockClient {
  constructor() {
    this.user = { id: 'bot_id', username: 'CowsayBot' };
    this.guilds = new MockGuildManager();
    this.channels = new MockChannelManager();
  }

  login() {
    return Promise.resolve();
  }

  on() {
    return this;
  }

  once() {
    return this;
  }
}

class MockGuildManager {
  cache = new Map();
  
  fetch() {
    return Promise.resolve(new MockGuild());
  }
}

class MockChannelManager {
  cache = new Map();
  
  fetch() {
    return Promise.resolve(new MockChannel());
  }
}

class MockGuild {
  constructor() {
    this.id = 'guild_id';
    this.name = 'Test Guild';
    this.members = new MockMemberManager();
    this.roles = new MockRoleManager();
  }
}

class MockMemberManager {
  cache = new Map();
  
  fetch() {
    return Promise.resolve(new MockMember());
  }
}

class MockRoleManager {
  cache = new Map();
}

class MockMember {
  constructor() {
    this.id = '123456789';
    this.user = new MockUser();
    this.permissions = new MockPermissions();
    this.roles = new MockMemberRoles();
  }
}

class MockUser {
  constructor() {
    this.id = '123456789';
    this.username = 'testuser';
    this.displayName = 'Test User';
  }
}

class MockPermissions {
  has() {
    return true; // Default to having permissions for tests
  }
}

class MockMemberRoles {
  cache = new Map();
  
  has() {
    return false;
  }
}

class MockChannel {
  constructor() {
    this.id = 'channel_id';
    this.type = 0; // Text channel
  }

  send() {
    return Promise.resolve(new MockMessage());
  }
}

class MockMessage {
  constructor() {
    this.id = 'message_id';
    this.content = 'test message';
    this.author = new MockUser();
    this.channel = new MockChannel();
  }

  reply() {
    return Promise.resolve(new MockMessage());
  }

  edit() {
    return Promise.resolve(this);
  }

  delete() {
    return Promise.resolve();
  }
}

class MockInteraction {
  constructor() {
    this.id = 'interaction_id';
    this.user = new MockUser();
    this.member = new MockMember();
    this.guild = new MockGuild();
    this.channel = new MockChannel();
    this.replied = false;
    this.deferred = false;
  }

  reply() {
    this.replied = true;
    return Promise.resolve();
  }

  editReply() {
    return Promise.resolve();
  }

  deferReply() {
    this.deferred = true;
    return Promise.resolve();
  }
}

// Export Discord.js-like structure
module.exports = {
  Client: MockClient,
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 512,
    MessageContent: 32768
  },
  Partials: {
    Message: 0,
    Channel: 1,
    Reaction: 2
  },
  PermissionFlagsBits: {
    Administrator: 8n,
    ManageMessages: 8192n,
    SendMessages: 2048n
  },
  EmbedBuilder: class MockEmbedBuilder {
    constructor() {
      this.data = {};
    }
    setTitle(title) { this.data.title = title; return this; }
    setDescription(desc) { this.data.description = desc; return this; }
    setColor(color) { this.data.color = color; return this; }
    addFields(...fields) { this.data.fields = fields; return this; }
  },
  ActionRowBuilder: class MockActionRowBuilder {
    constructor() {
      this.components = [];
    }
    addComponents(...components) { 
      this.components.push(...components); 
      return this; 
    }
  },
  ButtonBuilder: class MockButtonBuilder {
    constructor() {
      this.data = {};
    }
    setCustomId(id) { this.data.custom_id = id; return this; }
    setLabel(label) { this.data.label = label; return this; }
    setStyle(style) { this.data.style = style; return this; }
  },
  ButtonStyle: {
    Primary: 1,
    Secondary: 2,
    Success: 3,
    Danger: 4
  }
};