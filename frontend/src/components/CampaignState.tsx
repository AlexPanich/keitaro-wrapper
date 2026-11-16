import Tag from './Tag';

/** Метка состояния кампании Keitaro (`active` / `disabled`). */
export default function CampaignState({ state }: { state: string }) {
  return state === 'active' ? <Tag tone="ok">кампания активна</Tag> : <Tag tone="warn">кампания выключена</Tag>;
}
