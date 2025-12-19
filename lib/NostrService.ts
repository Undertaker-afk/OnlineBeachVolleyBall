import { SimplePool, generateSecretKey, getPublicKey, finalizeEvent, Event, Filter } from 'nostr-tools';

export type MatchCallback = (roomId: string, role: 'host' | 'client') => void;

interface Subscription {
    close: () => void;
}

export class NostrMatchmaker {
  private pool: SimplePool;
  private relays = ['wss://nos.lol'];
  private sk: Uint8Array;
  private pk: string;
  private sub: Subscription | null = null;
  private onMatch: MatchCallback | null = null;
  private isSearching = false;
  private myEventId: string | null = null;

  constructor() {
    this.pool = new SimplePool();
    this.sk = generateSecretKey();
    this.pk = getPublicKey(this.sk);
  }

  public async startSearching(onMatch: MatchCallback) {
    if (this.isSearching) return;
    this.isSearching = true;
    this.onMatch = onMatch;

    console.log('Nostr: Starting search...');

    // 1. Publish my search event
    const eventTemplate = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['t', 'beachvolley-trystero-v1']],
      content: 'looking_for_match',
      pubkey: this.pk,
    };

    const signedEvent = finalizeEvent(eventTemplate, this.sk);
    this.myEventId = signedEvent.id;

    await Promise.any(this.pool.publish(this.relays, signedEvent));
    console.log('Nostr: Published search event', this.myEventId);

    // 2. Subscribe to find others
    const filter: Filter = {
      kinds: [1],
      '#t': ['beachvolley-trystero-v1'],
      since: Math.floor(Date.now() / 1000) - 60 // Look back 1 minute
    };

    this.sub = this.pool.subscribeMany(
        this.relays,
        filter,
        {
            onevent: (event: Event) => {
                this.handleEvent(event);
            },
            onclose: () => {
                console.log("Nostr subscription closed");
            }
        }
    );
  }

  private handleEvent(event: Event) {
    if (!this.isSearching || !this.myEventId) return;
    if (event.pubkey === this.pk) return; // Ignore self

    console.log('Nostr: Found peer event', event.id);

    // Deterministic matchmaking
    // Compare Event IDs
    const myId = this.myEventId;
    const theirId = event.id;

    // To avoid race conditions, we can double check timestamps, but ID sort is unique.
    // If we are both searching, we both see each other.
    
    // Sort IDs to create a unique Room ID
    const ids = [myId, theirId].sort();
    const roomId = `match-${ids[0]}-${ids[1]}`;

    // Determine role
    // Lower ID = Host
    // Higher ID = Client
    const role = myId === ids[0] ? 'host' : 'client';

    console.log(`Nostr: Match found! Room: ${roomId}, Role: ${role}`);

    this.stopSearching();
    if (this.onMatch) {
      this.onMatch(roomId, role);
    }
  }

  public stopSearching() {
    this.isSearching = false;
    if (this.sub) {
      this.sub.close();
      this.sub = null;
    }
    // Optionally delete event or just let it expire (it's kind 1, so it persists, but we filter by time)
  }
}
