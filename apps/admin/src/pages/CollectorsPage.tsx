export function CollectorsPage() {
  return (
    <>
      <div className="toolbar">
        <input
          className="search-field"
          type="search"
          placeholder="Search collectors"
          disabled
          aria-label="Search collectors"
        />
        <span className="record-count">0 collectors</span>
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Mark</th>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Jerseys</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={5}>
                <div className="empty-state data-table-empty">
                  <h2>No collectors yet</h2>
                  <p>The collectors table will list users in a later slice.</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
