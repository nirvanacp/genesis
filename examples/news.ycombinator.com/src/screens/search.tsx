import { Notice } from "../components/ui";

export function SearchScreen() {
  return <div className="screen">
    <h1 className="screen-title">Search</h1>
    <Notice title="Search is coming">
      <p>This space will connect to a separate search site. For now, browse Home or your Saved stories.</p>
    </Notice>
  </div>;
}
