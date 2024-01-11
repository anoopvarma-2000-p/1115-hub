import {
  chainNB,
  SQLa_orch_duckdb as ddbo,
  SQLa_sqlpage as sp,
} from "./deps.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

type SQLPageFile = chainNB.NotebookCell<
  SQLPageNotebook,
  chainNB.NotebookCellID<SQLPageNotebook>
>;

const nbDescr = new chainNB.NotebookDescriptor<
  SQLPageNotebook,
  SQLPageFile
>();

const customComponents = {
  session_entries: "session_entries",
} as const;
type CustomComponentName = keyof typeof customComponents;

function sessionEntries(
  govn: ddbo.DuckDbOrchGovernance,
  customCB: sp.ComponentBuilder<
    CustomComponentName,
    ddbo.DuckDbOrchEmitContext
  >,
) {
  type TopLevelArgs = { readonly title: string };
  type Row = Record<
    keyof Pick<
      typeof govn.columnNames.orch_session_entry,
      "orch_session_entry_id" | "ingest_src" | "ingest_table_name"
    >,
    string
  >;
  type PageParams = { readonly session_entry_id: string };
  const [tla, pp, rc] = [
    sp.safeHandlebars<TopLevelArgs>(),
    sp.safePropNames<PageParams>(),
    sp.safeHandlebars<Row>(),
  ];
  const customComp: sp.CustomTemplateSupplier<
    ddbo.DuckDbOrchEmitContext,
    typeof customComponents.session_entries,
    TopLevelArgs,
    Row
  > = {
    templatePath: customCB.customTemplatePath(customComponents.session_entries),
    handlebarsCode: () => ({
      SQL: () =>
        sp.text`
          <h1>${tla.title}</h1>
  
          <ul>
          {{#each_row}}
              <li><a href="?${pp.session_entry_id}=${rc.orch_session_entry_id}">${rc.ingest_src}</a> (${rc.ingest_table_name})</li>
          {{/each_row}}
          </ul>`,
    }),
    component: (tlaArg) => {
      const { tableNames: tn, columnNames: { orch_session_entry: c } } = govn;
      const tla = tlaArg ?? { title: "Choose Session Entry" };
      return {
        ...tla,
        ...customCB.custom(
          customComponents.session_entries,
          tla,
          (topLevel) =>
            govn.SQL`
              ${topLevel}
              SELECT ${c.orch_session_entry_id}, ${c.ingest_src}, ${c.ingest_table_name} 
                FROM ${tn.orch_session_entry}`,
        ),
      };
    },
  };
  return customComp;
}

/**
 * Encapsulates [SQLPage](https://sql.ophir.dev/) content. SqlPageNotebook has
 * methods with the name of each SQLPage content that we want in the database.
 * The SQLPageNotebook.create method "reads" the cells in SqlPageNotebook (each
 * method's result) and generates SQL to insert the content of the page in the
 * database in the format and table expected by SQLPage `sqlpage_files` table.
 *
 * See: https://github.com/lovasoa/SQLpage/tree/main#hosting-sql-files-directly-inside-the-database
 *
 * If you want to store customizations (e.g. handlebar templates, etc.) see:
 * - https://sql.ophir.dev/custom_components.sql
 * - https://github.com/lovasoa/SQLpage/discussions/174
 *
 * If you want to create JSON APIs:
 * https://sql.ophir.dev/documentation.sql?component=json#component
 *
 * If you want to execute commands (assuming appropriate security) in SQLPage:
 * https://sql.ophir.dev/functions.sql?function=exec#function
 *
 * NOTE: we break our PascalCase convention for the name of the class since SQLPage
 *       is a proper noun (product name).
 */
export class SQLPageNotebook {
  readonly sc: ReturnType<typeof sp.sqliteContent<ddbo.DuckDbOrchEmitContext>>;
  readonly comps = sp.typicalComponents<string, ddbo.DuckDbOrchEmitContext>();
  readonly customCB = new sp.ComponentBuilder<
    CustomComponentName,
    ddbo.DuckDbOrchEmitContext
  >();
  readonly sessionEntries: ReturnType<typeof sessionEntries>;
  readonly imsTables: ReturnType<
    typeof this.sc.components.infoModelSchemaTables
  >;

  constructor(
    readonly govn: ddbo.DuckDbOrchGovernance,
    registerCTS: (
      ...cc: sp.CustomTemplateSupplier<
        ddbo.DuckDbOrchEmitContext,
        Any,
        Any,
        Any
      >[]
    ) => void,
  ) {
    this.sc = sp.sqliteContent(govn.SQL);
    this.sessionEntries = sessionEntries(govn, this.customCB);
    this.imsTables = this.sc.components.infoModelSchemaTables();
    registerCTS(this.sessionEntries, this.imsTables);
  }

  @nbDescr.disregard()
  shell() {
    // deno-fmt-ignore
    return this.govn.SQL`
      ${this.comps.shell({ 
          title: "QCS Orchestration Engine",
          icon: "book",
          link: "/",
          menuItems: [{ caption: "screenings" }, { caption: "sessions" }, { caption: "schema" }]
      })}
    `;
  }

  "index.sql"() {
    // passing in `chainNB.NotebookCellID<SQLPageNotebook>` allows us to restrict
    // menu hrefs to this notebook's cell names (the pages in SQLPage) for type
    // safety
    const { list, listItem: li } = sp.typicalComponents<
      chainNB.NotebookCellID<SQLPageNotebook>,
      ddbo.DuckDbOrchEmitContext
    >();

    // deno-fmt-ignore
    return this.govn.SQL`
      ${this.shell()}
      ${list({ items: [
                li({ title: "1115 Waiver Screenings", link: "1115-waiver-screenings.sql" }),
                li({ title: "Orchestration Sessions", link: "sessions.sql" }),
                li({ title: "Orchestration Issues", link: "issues.sql" }),
                li({ title: "Orchestration State Schema", link: "schema.sql" }),
               ]})}`;
  }

  "sessions.sql"() {
    const { comps: { table }, govn, govn: { SQL } } = this;
    const { tableNames: tn, columnNames: { orch_session_entry: c } } = govn;

    // deno-fmt-ignore
    return SQL`
      ${this.shell()}

      ${table({ rows: [{SQL: () => `SELECT * FROM ${tn.device}`}] })}

      ${table({ rows: [
        { SQL: () => `SELECT * FROM ${tn.orch_session}`}]})}

      ${table({ search: true, columns: { ingest_src: { markdown: true }}, rows: [
        { SQL: () => `SELECT '[' || ${c.ingest_src} || '](issues.sql?session_entry_id='|| ${c.orch_session_entry_id} ||')' as ${c.ingest_src}, ${c.ingest_table_name} FROM "${tn.orch_session_entry}"`}]})}
    `;
  }

  "issues.sql"() {
    const { comps: { table }, govn, govn: { SQL } } = this;
    const { tableNames: tn, columnNames: { orch_session_issue: c } } = govn;

    // ${breadcrumbs({ items: [
    //   { caption: "Home", href: "/" },
    //   { caption: { SQL: () => `(SELECT ingest_src FROM orch_session_entry WHERE orch_session_entry_id = $session_entry_id)` }, active: true } ]})}

    // deno-fmt-ignore
    return SQL`
      ${this.shell()}

      ${this.sessionEntries.component()}

      ${table({ search: true, rows: [
        { SQL: () => `
            SELECT ${c.issue_type}, ${c.issue_message}, ${c.invalid_value}, ${c.remediation}
              FROM ${tn.orch_session_issue}
             WHERE ${c.session_entry_id} = $${c.session_entry_id}`}]})}
      `;
  }

  "1115-waiver-screenings.sql"() {
    const { comps: { text, table }, govn: { SQL } } = this;

    // deno-fmt-ignore
    return SQL`
      ${this.shell()}

      ${table({ search: true, sort: true, rows: [
        { SQL: () => `
              SELECT format('[%s](?pat_mrn_id=%s)', pat_mrn_id, pat_mrn_id) as pat_mrn_id, facility, first_name, last_name
                FROM ahc_hrsn_12_12_2023_valid
            GROUP BY pat_mrn_id, facility, first_name, last_name
            ORDER BY facility, last_name, first_name`}], 
        columns: {pat_mrn_id: { markdown: true }}})}

      ${text({title: {SQL: () => `(select format('%s %s Answers', first_name, last_name) from ahc_hrsn_12_12_2023_valid where pat_mrn_id = $pat_mrn_id)`}})}
      ${table({ search: true, sort: true, rows: [
        { SQL: () => `
            SELECT question, meas_value 
              FROM "ahc_hrsn_12_12_2023_valid"
             WHERE pat_mrn_id = $pat_mrn_id`}],
        condition: { anyExists: '$pat_mrn_id' }})}

      ${text({title: {SQL: () => `(select format('%s %s FHIR Observations', first_name, last_name) from ahc_hrsn_12_12_2023_valid where pat_mrn_id = $pat_mrn_id)`}})}
      ${table({ search: true, sort: true, rows: [
        { SQL: () => `
            SELECT * 
              FROM "ahc_hrsn_12_12_2023_valid_fhir"
             WHERE pat_mrn_id = $pat_mrn_id`}],
        condition: { allExist: '$pat_mrn_id is not null' }})}

    `;
  }

  "schema.sql"() {
    const { govn: { SQL } } = this;
    return SQL`
      ${this.shell()}
      ${this.sc.infoSchemaSQL()}
    `;
  }

  static create(govn: ddbo.DuckDbOrchGovernance) {
    return sp.sqlPageNotebook(
      SQLPageNotebook.prototype,
      (registerCTS) => new SQLPageNotebook(govn, registerCTS),
      () => govn.emitCtx,
      nbDescr,
    );
  }
}