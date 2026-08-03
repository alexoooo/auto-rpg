/// Minimal `--key value` parser.
///
/// Deliberately not a dependency. The lab's whole argument surface is a dozen
/// integers, and this crate is the one that must build and run in CI on any
/// machine at any time.
pub struct Args {
    command: String,
    pairs: Vec<(String, String)>,
    flags: Vec<String>,
}

impl Args {
    pub fn from_env() -> Args {
        Args::parse(std::env::args().skip(1).collect())
    }

    pub fn parse(tokens: Vec<String>) -> Args {
        let mut command = String::new();
        let mut pairs = Vec::new();
        let mut flags = Vec::new();

        let mut i = 0;
        while i < tokens.len() {
            let token = &tokens[i];
            if let Some(key) = token.strip_prefix("--") {
                match tokens.get(i + 1) {
                    Some(value) if !value.starts_with("--") => {
                        pairs.push((key.to_string(), value.clone()));
                        i += 2;
                    }
                    _ => {
                        flags.push(key.to_string());
                        i += 1;
                    }
                }
            } else {
                if command.is_empty() {
                    command = token.clone();
                }
                i += 1;
            }
        }

        Args {
            command,
            pairs,
            flags,
        }
    }

    pub fn command(&self) -> &str {
        &self.command
    }

    fn raw(&self, key: &str) -> Option<&str> {
        self.pairs
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.as_str())
    }

    pub fn flag(&self, key: &str) -> bool {
        self.flags.iter().any(|f| f == key)
    }

    /// Exits with a clear message rather than silently falling back, because a
    /// typo in `--seeds 100O` that quietly runs the default is the kind of
    /// thing that wastes an afternoon of experiments.
    pub fn number(&self, key: &str, default: u64) -> u64 {
        match self.raw(key) {
            None => default,
            Some(text) => match text.parse::<u64>() {
                Ok(value) => value,
                Err(_) => {
                    eprintln!("--{key} expects a whole number, got '{text}'");
                    std::process::exit(2);
                }
            },
        }
    }

    pub fn usize(&self, key: &str, default: usize) -> usize {
        self.number(key, default as u64) as usize
    }

    pub fn u32(&self, key: &str, default: u32) -> u32 {
        self.number(key, default as u64) as u32
    }

    /// A named choice out of a fixed list. Exits with the list on a typo, for
    /// the same reason [`Args::number`] does: `--policy duellist` silently
    /// running the default is an afternoon wasted comparing a policy against
    /// itself.
    pub fn choice<T: Copy>(&self, key: &str, default: T, options: &[(&str, T)]) -> T {
        let text = match self.raw(key) {
            None => return default,
            Some(text) => text,
        };
        match options.iter().find(|(name, _)| *name == text) {
            Some((_, value)) => *value,
            None => {
                let names: Vec<&str> = options.iter().map(|(n, _)| *n).collect();
                eprintln!("--{key} expects one of {}, got '{text}'", names.join(", "));
                std::process::exit(2);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(line: &str) -> Args {
        Args::parse(line.split_whitespace().map(String::from).collect())
    }

    #[test]
    fn parses_command_pairs_and_flags() {
        let a = args("evolve --gens 40 --pop 24 --verbose");
        assert_eq!(a.command(), "evolve");
        assert_eq!(a.number("gens", 1), 40);
        assert_eq!(a.usize("pop", 1), 24);
        assert!(a.flag("verbose"));
        assert!(!a.flag("quiet"));
        assert_eq!(a.number("missing", 7), 7);
    }

    #[test]
    fn a_choice_resolves_by_name_and_falls_back_when_absent() {
        let options = [("utility", 0u32), ("duelist", 1)];
        let a = args("duel --policy duelist");
        assert_eq!(a.choice("policy", 0, &options), 1);
        assert_eq!(a.choice("opponent", 0, &options), 0);
    }

    #[test]
    fn a_valueless_option_at_the_end_is_a_flag() {
        let a = args("hash --write");
        assert!(a.flag("write"));
        assert_eq!(a.command(), "hash");
    }
}
