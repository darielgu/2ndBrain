export const people = [
  {
    id: 'maya',
    name: 'maya',
    whereMet: 'hackathon',
    summary: 'works on voice infra',
    openLoop: 'send repo',
    lastSeen: '3h ago',
    avatar:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=240&h=240&fit=crop&auto=format',
  },
  {
    id: 'elijah',
    name: 'elijah',
    whereMet: 'co-working loft',
    summary: 'shipping a wearables prototype',
    openLoop: 'intro to camera ml lead',
    lastSeen: 'yesterday',
    avatar:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=240&h=240&fit=crop&auto=format',
  },
  {
    id: 'sara',
    name: 'sara',
    whereMet: 'product meetup',
    summary: 'building agent onboarding flows',
    openLoop: 'share memory schema',
    lastSeen: '2d ago',
    avatar:
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=240&h=240&fit=crop&auto=format',
  },
]

export const recentEpisodes = [
  {
    id: 'ep-maya-01',
    personId: 'maya',
    person: 'maya',
    topic: 'voice infra',
    promise: 'send repo link before monday',
    timestamp: 'apr 12, 09:10',
  },
  {
    id: 'ep-elijah-01',
    personId: 'elijah',
    person: 'elijah',
    topic: 'camera latency',
    promise: 'review fallback identity ux',
    timestamp: 'apr 11, 16:44',
  },
  {
    id: 'ep-sara-01',
    personId: 'sara',
    person: 'sara',
    topic: 'agent onboarding',
    promise: 'share memory schema examples',
    timestamp: 'apr 10, 15:22',
  },
]

export const activeLoops = [
  'send repo to maya',
  'intro elijah to camera ml lead',
  'share memory schema with sara',
]
