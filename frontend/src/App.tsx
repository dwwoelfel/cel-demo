import React from "react";

import "antd/dist/reset.css";
import {
  Button,
  Card,
  Descriptions,
  Divider,
  Form,
  Input,
  Layout,
  Select,
  Typography,
} from "antd";

const { Text } = Typography;

type Rule = {
  name: string;
  expression: string;
  type: "allow" | "deny" | "redirect";
  status_code?: number | undefined;
  redirect_url?: string | undefined;
};

function Rule({
  rule,
  onMoveUp,
  onMoveDown,
  onRemove,
  onUpdateRule,
}: {
  rule: Rule;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
  onRemove: () => void;
  onUpdateRule: (rule: Rule) => void;
}) {
  const [ruleInput, setRuleInput] = React.useState(rule);
  const [inEditMode, setInEditMode] = React.useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "row" }}>
      <div
        style={{
          marginRight: 12,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          borderRight: "1px solid rgba(0,0,0,0.3)",
        }}
      >
        {onMoveUp ? (
          <Button ghost={true} onClick={() => onMoveUp()}>
            ⬆️
          </Button>
        ) : (
          <Button ghost={true} style={{ border: "none" }} disabled={true}>
            ⬆️
          </Button>
        )}
        <Button ghost={true} onClick={() => setInEditMode(!inEditMode)}>
          ✏️
        </Button>
        {onMoveDown ? (
          <Button ghost={true} onClick={() => onMoveDown()}>
            ⬇️
          </Button>
        ) : (
          <Button ghost={true} style={{ border: "none" }} disabled={true}>
            ⬇️
          </Button>
        )}
      </div>
      <div>
        <Descriptions
          column={1}
          layout={"horizontal"}
          colon={false}
          size="small"
        >
          <Descriptions.Item label="Name">{rule.name}</Descriptions.Item>
          <Descriptions.Item label="Expression">
            {inEditMode ? (
              <Input
                value={ruleInput.expression}
                onChange={(e) =>
                  setRuleInput({ ...ruleInput, expression: e.target.value })
                }
              />
            ) : (
              <Text code>{rule.expression}</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Type">{rule.type}</Descriptions.Item>
          {rule.type === "deny" ? (
            <Descriptions.Item label="Status Code">
              {rule.status_code}
            </Descriptions.Item>
          ) : null}
          {rule.type === "redirect" ? (
            <Descriptions.Item label="Redirect URL">
              {rule.redirect_url}
            </Descriptions.Item>
          ) : null}
        </Descriptions>
        {inEditMode ? (
          <div>
            <Button
              type="primary"
              style={{ marginRight: 12 }}
              onClick={() => {
                onUpdateRule(ruleInput);
                setInEditMode(false);
              }}
            >
              Save
            </Button>
            <Button
              style={{ marginRight: 12 }}
              onClick={() => {
                setRuleInput(rule);
                setInEditMode(false);
              }}
            >
              Cancel
            </Button>
          </div>
        ) : null}
      </div>
      <Button ghost={true} onClick={() => onRemove()}>
        ❌
      </Button>
    </div>
  );
}

function AddRule({
  onAddRule,
  onClose,
}: {
  onAddRule: (rule: Rule) => void;
  onClose: () => void;
}) {
  const [form] = Form.useForm();
  const [type, setType] = React.useState("allow");

  return (
    <div>
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => {
          if (values.status_code) {
            values.status_code = parseInt(values.status_code);
          }
          onAddRule(values);
        }}
      >
        <Form.Item label="Name" name="name" rules={[{ required: true }]}>
          <Input placeholder="Unique name"></Input>
        </Form.Item>
        <Form.Item
          tooltip={
            <Text color="white">
              <Typography.Paragraph style={{ color: "white" }}>
                Uses Google's CEL. There are two variables defined, `origin` and
                `request`.
              </Typography.Paragraph>
              <Typography.Paragraph style={{ color: "white" }}>
                Origin has fields `ip` and `region_code`
              </Typography.Paragraph>
              <Typography.Paragraph style={{ color: "white" }}>
                Request has fields `headers`, `method`, `path`, `scheme`, and
                `query`
              </Typography.Paragraph>
              <Typography.Paragraph style={{ color: "white" }}>
                In addition to the ordinary CEL functions, there is
                `ipIsInRange`, which takes an IP and a CIDR, e.g.
                `ipIsInRange(origin.ip, "9.9.9.9/24")`.
              </Typography.Paragraph>
            </Text>
          }
          label="Expression"
          name="expression"
          rules={[{ required: true }]}
        >
          <Input placeholder={`request.path.startsWith("/blog")`}></Input>
        </Form.Item>
        <Form.Item
          label="Type"
          name="type"
          initialValue={type}
          rules={[{ required: true }]}
        >
          <Select onChange={(v) => setType(v)}>
            <Select.Option value="allow">allow</Select.Option>
            <Select.Option value="deny">deny</Select.Option>
            <Select.Option value="redirect">redirect</Select.Option>
          </Select>
        </Form.Item>
        {type === "deny" ? (
          <Form.Item
            label="HTTP Status"
            name="status_code"
            rules={[{ required: true }]}
          >
            <Input type="number" placeholder={`403`}></Input>
          </Form.Item>
        ) : null}
        {type === "redirect" ? (
          <Form.Item
            label="Redirect URL"
            name="redirect_url"
            rules={[{ required: true }]}
          >
            <Input type="string" placeholder={`https://example.com`}></Input>
          </Form.Item>
        ) : null}
        <Button htmlType="submit" type="primary" style={{ marginRight: 12 }}>
          Add rule
        </Button>
        <Button onClick={() => onClose()}>Cancel</Button>
      </Form>
    </div>
  );
}

function TestResponse({ response }: { response: any }) {
  let evaluations = null;
  if (response.evaluations) {
    evaluations = (
      <div>
        <Typography.Paragraph>
          Evaluations:
          {response.evaluations.map(({ rule, cost, result }: any) => {
            return (
              <div key={rule.name}>
                Rule: {rule.name}, Result: {JSON.stringify(result)}, Cost:{" "}
                {cost}
              </div>
            );
          })}
        </Typography.Paragraph>
      </div>
    );
  }
  if (response.invalid_rules?.length) {
    return (
      <div>
        {evaluations}
        {response.invalid_rules.map(({ rule, error }: any) => {
          return (
            <div key={rule.name}>
              <Typography.Paragraph>
                <Text>
                  Rule <Text code>{rule.name}</Text> is invalid:
                  <pre>{error}</pre>
                </Text>
              </Typography.Paragraph>
            </div>
          );
        })}
      </div>
    );
  } else if (response.matched_rule) {
    const rule = response.matched_rule;
    return (
      <div>
        {evaluations}
        <Typography.Paragraph>
          Rule <Text code>{rule.name}</Text> matched. Request is{" "}
          {rule.type === "allow"
            ? "allowed"
            : rule.type === "deny"
            ? `denied with a ${rule.status_code}`
            : `redirected to ${rule.redirect_url}`}
          .
        </Typography.Paragraph>
      </div>
    );
  } else if (response.execution_error) {
    const { rule, error } = response.execution_error;
    return (
      <div>
        {evaluations}
        <Typography.Paragraph>
          <Text>
            Runtime error evaluationg <Text code>{rule.name}</Text>:
            <pre>{error}</pre>
          </Text>
        </Typography.Paragraph>
      </div>
    );
  } else {
    return (
      <div>
        {evaluations}
        <Typography.Paragraph>
          No rules matched, request is passed through.
        </Typography.Paragraph>
      </div>
    );
  }
}

function TestRequest({ rules }: { rules: Array<Rule> }) {
  const [loading, setLoading] = React.useState(false);
  const [resp, setResp] = React.useState(null);
  return (
    <Card title="Test rules against a request">
      <Typography.Paragraph>
        <Form
          onFinish={async (values) => {
            setLoading(true);
            try {
              setResp(null);
              const resp = await fetch("/test", {
                method: "POST",
                body: JSON.stringify({
                  request: {
                    headers: JSON.parse(values.headers),
                    method: values.method,
                    path: values.path,
                    scheme: values.scheme,
                    query: values.query,
                  },
                  origin: {
                    ip: values.ip,
                    region_code: values.region_code,
                  },
                  rules: rules.map((rule) => {
                    if (
                      rule.status_code &&
                      typeof rule.status_code === "string"
                    ) {
                      rule.status_code = parseInt(rule.status_code);
                    }
                    return rule;
                  }),
                }),
              });
              const json = await resp.json();
              setResp(json);
            } catch (e) {
              // XXX: Show error
              console.log(e);
            } finally {
              setLoading(false);
            }
          }}
        >
          <Form.Item label="origin.ip" name="ip" initialValue={"127.0.0.1"}>
            <Input />
          </Form.Item>
          <Form.Item
            label="origin.region_code"
            name="region_code"
            initialValue={"US"}
          >
            <Input />
          </Form.Item>
          <Form.Item label="request.method" name="method" initialValue={"GET"}>
            <Input />
          </Form.Item>
          <Form.Item label="request.path" name="path" initialValue={"/path"}>
            <Input />
          </Form.Item>
          <Form.Item
            label="request.scheme"
            name="scheme"
            initialValue={"https"}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="request.query (url-encoded)"
            name="query"
            initialValue={"?post=2"}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="request.headers"
            name="headers"
            rules={[
              {
                validateTrigger: "submit",
                validator(rule, value, callback) {
                  try {
                    JSON.parse(value);
                    callback();
                  } catch (e) {
                    callback(
                      "Invalid headers, must be a valid JSON object with string keys and string values."
                    );
                  }
                },
              },
            ]}
            initialValue={JSON.stringify(
              { "Content-Type": "application/json" },
              null,
              2
            )}
          >
            <Input.TextArea rows={5} />
          </Form.Item>
          <Button loading={loading} type="primary" htmlType="submit">
            Test
          </Button>
        </Form>
      </Typography.Paragraph>
      <Typography.Paragraph>
        {resp ? <TestResponse response={resp} /> : null}
      </Typography.Paragraph>
      <div style={{ height: 250 }}></div>
    </Card>
  );
}

function App() {
  const [rules, setRules] = React.useState<Array<Rule>>([
    {
      name: "Default Deny",
      expression: `true`,
      type: "deny",
      status_code: 403,
    },
  ]);
  const [showAddRuleForm, setShowAddRuleForm] = React.useState(false);
  return (
    <Layout>
      <Layout.Content
        style={{
          margin: "auto",
          overflow: "initial",
          minHeight: "100vh",
          width: 700,
        }}
      >
        <Card title="Rules">
          {rules.map((rule, i) => (
            <React.Fragment key={rule.name}>
              <Rule
                rule={rule}
                onRemove={() => {
                  setRules(rules.filter((rule, j) => i !== j));
                }}
                onUpdateRule={(newRule) => {
                  setRules(rules.map((rule, j) => (i === j ? newRule : rule)));
                }}
                onMoveUp={
                  i === 0
                    ? null
                    : () => {
                        const newRules: Array<Rule> = [];
                        rules.forEach((rule, j) => {
                          if (i === j + 1) {
                            newRules.push(rules[i]);
                          }
                          if (i !== j) {
                            newRules.push(rule);
                          }
                        });
                        setRules(newRules);
                        console.log("up");
                      }
                }
                onMoveDown={
                  i === rules.length - 1
                    ? null
                    : () => {
                        const newRules: Array<Rule> = [];
                        rules.forEach((rule, j) => {
                          console.log("i", i, "j", j, "rule", rule);
                          if (i === j) {
                            newRules.push(rules[j + 1]);
                            newRules.push(rule);
                          } else if (j !== i + 1) {
                            newRules.push(rule);
                          }
                        });
                        setRules(newRules);
                      }
                }
              />
              <Divider />
            </React.Fragment>
          ))}
          {showAddRuleForm ? (
            <AddRule
              onClose={() => setShowAddRuleForm(false)}
              onAddRule={(rule) => {
                setRules([...rules, rule]);
                setShowAddRuleForm(false);
              }}
            />
          ) : (
            <Button onClick={() => setShowAddRuleForm(true)}>
              Add new rule
            </Button>
          )}
        </Card>
        <TestRequest rules={rules} />
      </Layout.Content>
    </Layout>
  );
}

export default App;
