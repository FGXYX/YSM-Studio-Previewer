import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  Eye,
  EyeOff,
  ListTree,
  RotateCcw,
  Search,
  Sparkles,
} from 'lucide-react';
import type { BedrockBone, BoneVisibilityState, ParsedProject } from '@/types';

interface Props {
  project: ParsedProject;
  readOnly?: boolean;
  onSetVisibility: (name: string, state: BoneVisibilityState) => void;
  onResetVisibility: () => void;
}

interface TreeNode {
  name: string;
  label: string;
  parent?: string;
  depth: number;
  children: TreeNode[];
  hasGeometry: boolean;
  geometryCount: number;
  helper: boolean;
}

const COMMON_RE =
  /hair|head|face|eye|brow|ear|horn|hat|ribbon|arm|hand|leg|foot|skirt|cape|cloth|coat|tail|wing|weapon|sword|shield|bag|backpack/i;

const COMMON_DEFAULT_NAMES = new Set([
  'Hair',
  'Head',
  'Face',
  'Eyes',
  'LeftArm',
  'RightArm',
  'LeftForeArm',
  'RightForeArm',
  'LeftHand',
  'RightHand',
  'LeftLeg',
  'RightLeg',
  'Skirt',
  'Cape',
  'cape',
  'Jacket',
  'Hat',
  'Ribbon',
  'Tail',
  'Wing',
]);

const HELPER_RE =
  /locator|constraint|socket|attachment|effector|target|dummy|helper|controller|reference/i;

const LABELS: Record<string, string> = {
  Root: '根骨骼',
  MAllBody: '总身体',
  AllBody: '身体',
  UpBody: '上身',
  UpperBody: '上半身',
  AllHead: '头部组',
  MHead: '头部控制',
  Head: '头部',
  Hair: '头发',
  Face: '面部',
  Eyes: '眼睛',
  Eyebrow: '眉毛',
  Hat: '帽子',
  Ribbon: '发饰',
  Arm: '手臂组',
  LeftArm: '左臂',
  RightArm: '右臂',
  LeftForeArm: '左前臂',
  RightForeArm: '右前臂',
  LeftHand: '左手',
  RightHand: '右手',
  DownBody: '下身',
  Leg: '腿组',
  LeftLeg: '左腿',
  RightLeg: '右腿',
  LeftLowerLeg: '左小腿',
  RightLowerLeg: '右小腿',
  LeftFoot: '左脚',
  RightFoot: '右脚',
  Skirt: '裙摆',
  LeftSkirt: '左裙摆',
  RightSkirt: '右裙摆',
  FrontSkirt: '前裙摆',
  BackSkirt: '后裙摆',
  Cape: '披风',
  cape: '披风',
  Jacket: '外套',
  Tail: '尾巴',
  Wing: '翅膀',
  Weapon: '武器',
  Sword: '剑',
};

function labelFor(name: string): string {
  if (LABELS[name]) return LABELS[name];
  const normalized = name.replaceAll('_', ' ').replaceAll('.', ' ').trim();
  return normalized || name;
}

function geometryCount(bone: BedrockBone): number {
  return (bone.raw_meshes?.length ?? 0) + (bone.cubes?.length ?? 0);
}

function buildTree(project: ParsedProject): { roots: TreeNode[]; flat: TreeNode[] } {
  const bones = project.model.bones;
  const byName = new Map(bones.map((bone) => [bone.name, bone]));
  const childrenByParent = new Map<string, BedrockBone[]>();
  const rawRoots: BedrockBone[] = [];

  for (const bone of bones) {
    if (bone.parent && byName.has(bone.parent)) {
      const list = childrenByParent.get(bone.parent) ?? [];
      list.push(bone);
      childrenByParent.set(bone.parent, list);
    } else {
      rawRoots.push(bone);
    }
  }

  const flat: TreeNode[] = [];
  const visiting = new Set<string>();

  const build = (bone: BedrockBone, depth: number): TreeNode | null => {
    if (visiting.has(bone.name)) return null;
    visiting.add(bone.name);
    const children = (childrenByParent.get(bone.name) ?? [])
      .map((child) => build(child, depth + 1))
      .filter((child): child is TreeNode => Boolean(child));
    visiting.delete(bone.name);

    const count = geometryCount(bone);
    if (count === 0 && children.length === 0) return null;

    const node: TreeNode = {
      name: bone.name,
      label: labelFor(bone.name),
      parent: bone.parent,
      depth,
      children,
      hasGeometry: count > 0,
      geometryCount: count,
      helper: HELPER_RE.test(bone.name) && count === 0,
    };
    flat.push(node);
    return node;
  };

  const roots = rawRoots
    .map((bone) => build(bone, 0))
    .filter((node): node is TreeNode => Boolean(node));
  return { roots, flat };
}

function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) return nodes;
  const needle = query.toLowerCase();
  return nodes
    .map((node) => {
      const children = filterTree(node.children, query);
      const selfMatch =
        node.name.toLowerCase().includes(needle) || node.label.toLowerCase().includes(needle);
      if (!selfMatch && children.length === 0) return null;
      return { ...node, children };
    })
    .filter((node): node is TreeNode => Boolean(node));
}

function collectAncestors(node: TreeNode, byName: Map<string, TreeNode>, target: Set<string>) {
  target.add(node.name);
  let parent = node.parent;
  while (parent) {
    const parentNode = byName.get(parent);
    if (!parentNode) break;
    target.add(parentNode.name);
    parent = parentNode.parent;
  }
}

function TreeRow({
  node,
  expanded,
  forceExpanded,
  overrides,
  effective,
  readOnly,
  onToggleExpanded,
  onToggleVisibility,
}: {
  node: TreeNode;
  expanded: Set<string>;
  forceExpanded: boolean;
  overrides: Record<string, BoneVisibilityState>;
  effective: Map<string, boolean>;
  readOnly: boolean;
  onToggleExpanded: (name: string) => void;
  onToggleVisibility: (node: TreeNode) => void;
}) {
  const open = forceExpanded || expanded.has(node.name);
  const visible = effective.get(node.name) ?? true;
  const overridden = overrides[node.name] && overrides[node.name] !== 'inherit';

  return (
    <>
      <div
        className={`bone-row${node.helper ? ' helper' : ''}${visible ? '' : ' is-hidden'}`}
        style={{ paddingLeft: 7 + node.depth * 12 }}
      >
        {node.children.length > 0 ? (
          <button
            className="bone-caret"
            onClick={() => onToggleExpanded(node.name)}
            title={open ? '折叠' : '展开'}
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="bone-caret-spacer" />
        )}
        <button
          className={`bone-eye${visible ? '' : ' off'}`}
          onClick={() => onToggleVisibility(node)}
          disabled={readOnly}
          title={
            readOnly
              ? '模拟模式下由模型状态与配置决定可见性'
              : visible
                ? `隐藏 ${node.name}`
                : `显示 ${node.name}`
          }
        >
          {visible ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
        <button className="bone-label" onClick={() => onToggleExpanded(node.name)} title={node.name}>
          <span>{node.label}</span>
          {node.label !== node.name && <small>{node.name}</small>}
        </button>
        {node.geometryCount > 0 && <span className="bone-count">{node.geometryCount}</span>}
        {overridden && <span className="bone-override" title="手动覆盖父级显隐" />}
      </div>
      {open &&
        node.children.map((child) => (
          <TreeRow
            key={child.name}
            node={child}
            expanded={expanded}
            forceExpanded={forceExpanded}
            overrides={overrides}
            effective={effective}
            readOnly={readOnly}
            onToggleExpanded={onToggleExpanded}
            onToggleVisibility={onToggleVisibility}
          />
        ))}
    </>
  );
}

export function BoneTree({ project, readOnly = false, onSetVisibility, onResetVisibility }: Props) {
  const { roots, flat } = useMemo(() => buildTree(project), [project]);
  const byName = useMemo(() => new Map(flat.map((node) => [node.name, node])), [flat]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, BoneVisibilityState>>({});

  const meshBoneCount = useMemo(() => flat.filter((node) => node.hasGeometry).length, [flat]);

  const effective = useMemo(() => {
    const cache = new Map<string, boolean>();
    const resolve = (name: string): boolean => {
      if (cache.has(name)) return cache.get(name)!;
      const chain: string[] = [];
      const guard = new Set<string>();
      let current: string | undefined = name;
      while (current && !guard.has(current)) {
        chain.push(current);
        guard.add(current);
        current = byName.get(current)?.parent;
      }
      let visible = true;
      for (let index = chain.length - 1; index >= 0; index -= 1) {
        const state = overrides[chain[index]];
        if (state === 'visible') visible = true;
        else if (state === 'hidden') visible = false;
      }
      cache.set(name, visible);
      return visible;
    };
    for (const node of flat) resolve(node.name);
    return cache;
  }, [flat, byName, overrides]);

  useEffect(() => {
    setQuery('');
    setOverrides({});
    const initial = new Set<string>();
    for (const node of flat) {
      if (node.depth <= 1) initial.add(node.name);
    }
    // Open the paths to the most common parts so the tree is useful without
    // requiring five manual expansions first.
    let common = 0;
    for (const node of flat) {
      if (!COMMON_DEFAULT_NAMES.has(node.name)) continue;
      let parent = node.parent;
      while (parent) {
        initial.add(parent);
        parent = byName.get(parent)?.parent;
      }
      common += 1;
      if (common >= 20) break;
    }
    setExpanded(initial);
    onResetVisibility();
    // Reset on model change and on mode switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, readOnly]);

  const visibleRoots = useMemo(() => filterTree(roots, query.trim()), [roots, query]);
  const forceExpanded = query.trim().length > 0;

  const toggleExpanded = (name: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleVisibility = (node: TreeNode) => {
    if (readOnly) return;
    const currentlyVisible = effective.get(node.name) ?? true;
    const state: BoneVisibilityState = currentlyVisible ? 'hidden' : 'visible';
    setOverrides((previous) => ({ ...previous, [node.name]: state }));
    onSetVisibility(node.name, state);
  };

  const resetVisibility = () => {
    setOverrides({});
    onResetVisibility();
  };

  const expandCommon = () => {
    const next = new Set(expanded);
    let matched = 0;
    for (const node of flat) {
      if (!COMMON_RE.test(node.name)) continue;
      collectAncestors(node, byName, next);
      matched += 1;
      if (matched >= 30) break;
    }
    setExpanded(next);
  };

  const collapseAll = () => {
    setExpanded(new Set());
  };

  return (
    <div className="bone-tree">
      <div className="bone-tree-toolbar">
        <span className="bone-tree-count">
          <ListTree size={12} />
          {meshBoneCount} 个可隐藏骨骼
        </span>
        <button
          onClick={resetVisibility}
          disabled={readOnly}
          title={
            readOnly
              ? '模拟模式下由运行时状态决定'
              : '清除所有手动覆盖，恢复全部可见'
          }
        >
          <RotateCcw size={11} /> 全部显示
        </button>
      </div>

      {readOnly && (
        <div className="bone-runtime-note">
          模拟模式：部件可见性由模型状态、装备与配置决定，手动开关已锁定。
        </div>
      )}

      <label className="bone-search">
        <Search size={12} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索骨骼 / 部件名…"
          spellCheck={false}
        />
        {query && (
          <button onClick={() => setQuery('')} title="清除搜索">
            ×
          </button>
        )}
      </label>

      <div className="bone-tree-actions">
        <button onClick={expandCommon}>
          <Sparkles size={11} /> 展开常用
        </button>
        <button onClick={collapseAll}>
          <ChevronsDownUp size={11} /> 全部折叠
        </button>
      </div>

      <div className="bone-tree-list">
        {visibleRoots.map((node) => (
          <TreeRow
            key={node.name}
            node={node}
            expanded={expanded}
            forceExpanded={forceExpanded}
            overrides={overrides}
            effective={effective}
            readOnly={readOnly}
            onToggleExpanded={toggleExpanded}
            onToggleVisibility={toggleVisibility}
          />
        ))}
        {visibleRoots.length === 0 && (
          <div className="bone-tree-empty">
            {query ? `没有匹配 “${query}” 的部件` : '该模型没有可显示的骨骼。'}
          </div>
        )}
      </div>
    </div>
  );
}
